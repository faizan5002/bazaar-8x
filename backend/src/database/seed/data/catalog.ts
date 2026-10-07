import { photo } from './images';
import type { CategorySeed, SellerSeed } from './types';

export const SELLERS: SellerSeed[] = [
  {
    slug: 'voltline-electronics',
    name: 'Voltline Electronics',
    description: 'Audio, wearables and home entertainment from established brands, shipped from our regional warehouse.',
    rating: 4.7,
  },
  {
    slug: 'techhaven',
    name: 'TechHaven',
    description: 'Laptops, desktops, phones and accessories. Every device is new, sealed and covered by a one-year warranty.',
    rating: 4.6,
  },
  {
    slug: 'hearth-and-home',
    name: 'Hearth & Home Supply',
    description: 'Kitchenware, bedding, home essentials and a curated pantry of everyday staples.',
    rating: 4.8,
  },
  {
    slug: 'glowhouse-beauty',
    name: 'Glowhouse Beauty',
    description: 'Skincare, hair care and beauty tools. Cruelty-free formulas, dermatologist-tested where noted.',
    rating: 4.7,
  },
  {
    slug: 'summit-and-stride',
    name: 'Summit & Stride',
    description: 'Fitness equipment, outdoor gear and everyday apparel built to last.',
    rating: 4.5,
  },
  {
    slug: 'bookmark-corner',
    name: 'Bookmark Corner',
    description: 'New books in every genre, packed carefully and shipped within one business day.',
    rating: 4.9,
  },
];

export const CATEGORIES: CategorySeed[] = [
  { slug: 'electronics', name: 'Electronics', sortOrder: 1, imageUrl: photo('1505740420928-5e560c06d30e', 600) },
  { slug: 'computers', name: 'Computers', sortOrder: 2, imageUrl: photo('1496181133206-80ce9b88a853', 600) },
  { slug: 'home-kitchen', name: 'Home & Kitchen', sortOrder: 3, imageUrl: photo('1556911220-bff31c812dba', 600) },
  { slug: 'beauty-personal-care', name: 'Beauty & Personal Care', sortOrder: 4, imageUrl: photo('1596462502278-27bfdc403348', 600) },
  { slug: 'sports-fitness', name: 'Sports & Fitness', sortOrder: 5, imageUrl: photo('1601925260368-ae2f83cf8b7f', 600) },
  { slug: 'fashion', name: 'Fashion', sortOrder: 6, imageUrl: photo('1544022613-e87ca75a784a', 600) },
  { slug: 'books', name: 'Books', sortOrder: 7, imageUrl: photo('1532012197267-da84d127e765', 600) },
  { slug: 'grocery', name: 'Grocery', sortOrder: 8, imageUrl: photo('1447933601403-0c6688de566e', 600) },
];
