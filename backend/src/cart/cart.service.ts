import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DeliveryQuote, MAX_QUANTITY_PER_ITEM, quote } from '../common/pricing';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { Cart } from './cart.entity';
import { AddCartItemDto } from './dto/cart.dto';

export interface CartLine {
  id: number;
  productId: number;
  title: string;
  image: string | null;
  sellerName: string;
  unitPrice: number;
  originalPrice: number | null;
  quantity: number;
  lineTotal: number;
  selectedVariants: Record<string, string>;
  stock: number;
  /** Most the shopper may hold of this product right now: min(stock, per-order limit). */
  maxQuantity: number;
  freeShipping: boolean;
  /** Set when the line can't be ordered as it stands (stock changed after it was added). */
  issue: { code: 'unavailable' | 'insufficient'; message: string } | null;
}

export interface CartView {
  items: CartLine[];
  /** Total units, what the header badge shows. */
  itemCount: number;
  subtotal: number;
  /** Standard-delivery estimate; checkout shows each delivery option's own figures. */
  shipping: number;
  tax: number;
  total: number;
  deliveryOptions: DeliveryQuote[];
  /** True when every line can be ordered right now. */
  canCheckout: boolean;
}

const limitFor = (stock: number) => Math.min(Math.max(stock, 0), MAX_QUANTITY_PER_ITEM);

/** The cart belongs to the authenticated user; every method takes the user id from the verified JWT, never from the request body. */
@Injectable()
export class CartService {
  constructor(private readonly dataSource: DataSource) {}

  get(userId: number) {
    return this.dataSource.transaction(async (em) => this.view(em, (await this.ensureCart(em, userId)).id));
  }

  add(userId: number, dto: AddCartItemDto) {
    return this.locked(userId, async (em, cart) => {
      const product = await em.findOne(Product, { where: { id: dto.productId } });
      if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);
      if (product.stock <= 0) throw new ConflictException(`"${product.title}" is currently unavailable.`);
      const selectedVariants = this.resolveVariants(product, dto.selectedVariants);

      const existing = await em.findOne(CartItem, { where: { cart: { id: cart.id }, product: { id: product.id } } });
      const quantity = (existing?.quantity ?? 0) + dto.quantity;
      this.assertWithinLimit(product, quantity, existing?.quantity ?? 0);

      // One row per product: a repeat add raises the quantity and takes the latest variant choice.
      if (existing) await em.update(CartItem, existing.id, { quantity, selectedVariants });
      else await em.insert(CartItem, { cart: { id: cart.id }, product: { id: product.id }, quantity, selectedVariants });
    });
  }

  updateQuantity(userId: number, itemId: number, quantity: number) {
    return this.locked(userId, async (em, cart) => {
      const item = await this.findItem(em, cart, itemId);
      // Lowering a quantity is always allowed (even if stock has since dropped); raising it is checked.
      if (quantity > item.quantity) {
        if (item.product.stock <= 0) throw new ConflictException(`"${item.product.title}" is currently unavailable.`);
        this.assertWithinLimit(item.product, quantity, item.quantity);
      }
      await em.update(CartItem, item.id, { quantity });
    });
  }

  remove(userId: number, itemId: number) {
    return this.locked(userId, async (em, cart) => {
      const item = await this.findItem(em, cart, itemId);
      await em.delete(CartItem, item.id);
    });
  }

  clear(userId: number) {
    return this.locked(userId, async (em, cart) => {
      await em.delete(CartItem, { cart: { id: cart.id } });
    });
  }

  // ---- internals ------------------------------------------------------------------------------------------------

  /** Runs `change` in a transaction holding a row lock on the user's cart, then returns the fresh cart. */
  private locked(userId: number, change: (em: EntityManager, cart: Cart) => Promise<void>) {
    return this.dataSource.transaction(async (em) => {
      const cart = await this.ensureCart(em, userId, true);
      await change(em, cart);
      return this.view(em, cart.id);
    });
  }

  /** Creates the user's cart on first use. `ON CONFLICT DO NOTHING` makes simultaneous first requests safe. */
  private async ensureCart(em: EntityManager, userId: number, lock = false): Promise<Cart> {
    await em.createQueryBuilder().insert().into(Cart).values({ user: { id: userId } }).orIgnore().execute();
    const query = em.createQueryBuilder(Cart, 'cart').where('cart.userId = :userId', { userId });
    if (lock) query.setLock('pessimistic_write');
    return query.getOneOrFail();
  }

  private async findItem(em: EntityManager, cart: Cart, itemId: number) {
    // Scoped to this user's cart: someone else's item id is indistinguishable from a missing one.
    const item = await em.findOne(CartItem, { where: { id: itemId, cart: { id: cart.id } } });
    if (!item) throw new NotFoundException('That item is not in your cart.');
    return item;
  }

  private assertWithinLimit(product: Product, wanted: number, alreadyInCart: number) {
    const limit = limitFor(product.stock);
    if (wanted <= limit) return;
    const reason = product.stock < MAX_QUANTITY_PER_ITEM ? `Only ${product.stock} in stock` : `The limit is ${MAX_QUANTITY_PER_ITEM} per order`;
    throw new ConflictException(`${reason} for "${product.title}".${alreadyInCart > 0 ? ` You already have ${alreadyInCart} in your cart.` : ''}`);
  }

  /** Only real options of real variant groups are accepted; groups left out default to their first option. */
  private resolveVariants(product: Product, chosen: Record<string, string> = {}): Record<string, string> {
    const groups = new Map(product.variants.map((g) => [g.name, g.options]));
    for (const [name, option] of Object.entries(chosen)) {
      const options = groups.get(name);
      if (!options) throw new BadRequestException(`"${name}" is not an option for this product.`);
      if (typeof option !== 'string' || !options.includes(option)) throw new BadRequestException(`"${String(option)}" is not an available ${name}.`);
    }
    return Object.fromEntries(product.variants.map((g) => [g.name, chosen[g.name] ?? g.options[0]]));
  }

  private async view(em: EntityManager, cartId: number): Promise<CartView> {
    const rows = await em.find(CartItem, { where: { cart: { id: cartId } }, relations: { product: { seller: true } }, order: { id: 'ASC' } });
    const items = rows.map((row): CartLine => {
      const p = row.product;
      const issue: CartLine['issue'] =
        p.stock <= 0
          ? { code: 'unavailable', message: 'Currently unavailable. Remove it to continue.' }
          : row.quantity > p.stock
            ? { code: 'insufficient', message: `Only ${p.stock} in stock. Reduce the quantity to continue.` }
            : null;
      return {
        id: row.id,
        productId: p.id,
        title: p.title,
        image: p.images[0] ?? null,
        sellerName: p.seller.name,
        unitPrice: p.price,
        originalPrice: p.originalPrice,
        quantity: row.quantity,
        lineTotal: Math.round(p.price * 100 * row.quantity) / 100,
        selectedVariants: row.selectedVariants,
        stock: p.stock,
        maxQuantity: limitFor(p.stock),
        freeShipping: p.freeShipping,
        issue,
      };
    });
    const pricing = quote(rows.map((r) => ({ unitPrice: r.product.price, quantity: r.quantity, freeShipping: r.product.freeShipping, deliveryDays: r.product.deliveryDays })));
    return {
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      ...pricing,
      canCheckout: items.length > 0 && items.every((i) => !i.issue),
    };
  }
}
