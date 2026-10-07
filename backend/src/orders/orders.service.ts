import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CartItem } from '../cart/cart-item.entity';
import { Cart } from '../cart/cart.entity';
import { DeliveryOptionId, isoDate, priceFor, quote } from '../common/pricing';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { CreateOrderDto, PaymentMethodId } from './dto/create-order.dto';
import { OrderItem } from './order-item.entity';
import { Order, OrderStatus, ShippingAddress } from './order.entity';

const PAYMENT_LABELS: Record<PaymentMethodId, string> = { card: 'Credit/Debit Card (mock)', cod: 'Cash on Delivery' };

export interface OrderView {
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
  items: {
    id: number;
    productId: number | null;
    title: string;
    imageUrl: string | null;
    sellerName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    selectedVariants: Record<string, string>;
  }[];
  itemCount: number;
  shippingAddress: ShippingAddress;
  deliveryOption: DeliveryOptionId;
  deliveryOptionLabel: string;
  paymentMethod: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  /** ISO date (YYYY-MM-DD). */
  estimatedDelivery: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Turns the user's cart into an order, atomically: either everything below happens or nothing does.
   *  1. lock the cart and read it (an empty cart is a 400)
   *  2. take the stock with a guarded UPDATE (`stock >= quantity`), so two buyers can never both get the last unit
   *  3. price it with the same rules the cart displayed
   *  4. snapshot title / image / seller / price into the order lines, so history survives later catalog edits
   *  5. empty the cart
   */
  create(userId: number, dto: CreateOrderDto): Promise<OrderView> {
    return this.dataSource.transaction(async (em) => {
      const cart = await em.createQueryBuilder(Cart, 'cart').setLock('pessimistic_write').where('cart.userId = :userId', { userId }).getOne();
      const lines = cart ? await em.find(CartItem, { where: { cart: { id: cart.id } }, relations: { product: { seller: true } }, order: { id: 'ASC' } }) : [];
      if (!cart || lines.length === 0) throw new BadRequestException('Your cart is empty.');

      for (const line of lines) await this.takeStock(em, line.product, line.quantity);

      const totals = priceFor(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, freeShipping: l.product.freeShipping, deliveryDays: l.product.deliveryDays })),
        dto.deliveryOption,
      );

      const order = em.create(Order, {
        orderNumber: this.newOrderNumber(),
        user: { id: userId } as User,
        status: OrderStatus.Placed,
        shippingAddress: { ...dto.shippingAddress },
        deliveryOption: dto.deliveryOption,
        paymentMethod: PAYMENT_LABELS[dto.paymentMethod],
        subtotal: totals.subtotal,
        shippingCost: totals.shipping,
        tax: totals.tax,
        total: totals.total,
        estimatedDelivery: totals.estimatedDelivery,
        items: lines.map((l) =>
          em.create(OrderItem, {
            product: { id: l.product.id } as Product,
            title: l.product.title,
            imageUrl: l.product.images[0] ?? null,
            sellerName: l.product.seller.name,
            unitPrice: l.product.price,
            quantity: l.quantity,
            selectedVariants: l.selectedVariants,
          }),
        ),
      });
      const saved = await em.save(order);
      await em.delete(CartItem, { cart: { id: cart.id } });
      return this.toView(saved);
    });
  }

  /** Only the order's owner can read it; anyone else gets the same 404 as for a number that doesn't exist. */
  async findOne(userId: number, orderNumber: string): Promise<OrderView> {
    const order = await this.dataSource.getRepository(Order).findOne({ where: { orderNumber, user: { id: userId } } });
    if (!order) throw new NotFoundException('Order not found.');
    return this.toView(order);
  }

  private async takeStock(em: EntityManager, product: Product, quantity: number) {
    const result = await em
      .createQueryBuilder()
      .update(Product)
      .set({ stock: () => `stock - ${Math.trunc(quantity)}` })
      .where('id = :id AND stock >= :quantity', { id: product.id, quantity })
      .execute();
    if (result.affected) return;
    const fresh = await em.findOne(Product, { where: { id: product.id } });
    throw new ConflictException(
      fresh && fresh.stock > 0 ? `"${product.title}": only ${fresh.stock} left in stock. Update your cart and try again.` : `"${product.title}" is no longer available. Remove it from your cart and try again.`,
    );
  }

  /** "BZR-20261007-483920": easy to read out, effectively unique (the column is unique-indexed as a backstop). */
  private newOrderNumber() {
    const date = isoDate(new Date()).replaceAll('-', '');
    return `BZR-${date}-${randomInt(100_000, 1_000_000)}`;
  }

  private toView(order: Order): OrderView {
    const items = [...order.items].sort((a, b) => a.id - b.id).map((i) => ({
      id: i.id,
      productId: i.product?.id ?? null,
      title: i.title,
      imageUrl: i.imageUrl,
      sellerName: i.sellerName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: Math.round(i.unitPrice * 100 * i.quantity) / 100,
      selectedVariants: i.selectedVariants,
    }));
    const option = quote([]).deliveryOptions.find((o) => o.id === order.deliveryOption);
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      shippingAddress: order.shippingAddress,
      deliveryOption: order.deliveryOption as DeliveryOptionId,
      deliveryOptionLabel: option?.label ?? order.deliveryOption,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      tax: order.tax,
      total: order.total,
      estimatedDelivery: order.estimatedDelivery,
    };
  }
}
