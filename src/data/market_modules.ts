export interface MarketModuleConfig {
  id: string;
  name: string;
  badge: string;
  tenantId: string;
  sellerId: string;
  defaultTitle: string;
  description: string;
  unit: string;
  basePrice: number; // Rial
  minIncrement: number; // Rial
  depositRateBps: number; // 1500 = 15%
  ladderSize: number;
  durationMinutes: number;
}

export const MARKET_MODULES: MarketModuleConfig[] = [
  {
    id: 'gold',
    name: 'Precious Metals & Gold',
    badge: 'Bullion & Coins',
    tenantId: 'tenant-gold-bourse',
    sellerId: 'central-bullion-vault',
    defaultTitle: '100x Bahar Azadi Gold Bullion Lots (Standard 900 Fineness)',
    description: 'Physical certified gold bullion lot stored in insured custodian vault with assay certificates.',
    unit: '100 Coins (813.6g)',
    basePrice: 42_500_000_000, // 42.5 Billion Rial (~4.25 Billion Toman)
    minIncrement: 250_000_000, // 250 Million Rial
    depositRateBps: 1500, // 15%
    ladderSize: 5,
    durationMinutes: 120,
  },
  {
    id: 'petrochemicals',
    name: 'Petrochemicals & Energy',
    badge: 'Commodity Polymers',
    tenantId: 'tenant-energy-bourse',
    sellerId: 'persian-petrochem-corp',
    defaultTitle: '200 MT High-Density Polyethylene (HDPE Film Grade 7000F)',
    description: 'Direct petrochemical allocation with EXW refinery loading port documentation.',
    unit: '200 Metric Tons',
    basePrice: 85_000_000_000,
    minIncrement: 500_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 90,
  },
  {
    id: 'automotive',
    name: 'Automotive & Heavy Fleet',
    badge: 'Industrial Fleet',
    tenantId: 'tenant-automotive-hub',
    sellerId: 'national-fleet-liquidators',
    defaultTitle: '2026 Commercial Hauler Trucks Batch (4 Units Heavy Duty)',
    description: 'Batch of 4 zero-kilometer European-spec freight commercial logistics prime movers.',
    unit: '4 Vehicles Lot',
    basePrice: 120_000_000_000,
    minIncrement: 1_000_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 60,
  },
  {
    id: 'real_estate',
    name: 'Real Estate & Land',
    badge: 'Commercial Prime',
    tenantId: 'tenant-realty-holding',
    sellerId: 'urban-development-fund',
    defaultTitle: 'Prime Logistics Hub & Free-Zone Warehouse (2,500 m² Enclosed)',
    description: 'Clear title commercial property with industrial power substation and customs gate access.',
    unit: 'Single Property Title',
    basePrice: 350_000_000_000,
    minIncrement: 2_500_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 180,
  },
  {
    id: 'agriculture',
    name: 'Agriculture & Exports',
    badge: 'Export Agro Lot',
    tenantId: 'tenant-agri-commodities',
    sellerId: 'cooperative-agri-union',
    defaultTitle: 'Super Negin Export-Grade Saffron (150 kg Certified Batch)',
    description: 'Phytosanitary certified high-crocin export lot packaged in vacuum tamper-proof canisters.',
    unit: '150 Kilograms',
    basePrice: 18_000_000_000,
    minIncrement: 100_000_000,
    depositRateBps: 1500,
    ladderSize: 5,
    durationMinutes: 90,
  },
  {
    id: 'goods',
    name: 'Industrial Machinery & Goods',
    badge: 'High-Tech Capital Goods',
    tenantId: 'tenant-industrial-exchange',
    sellerId: 'advanced-tooling-ltd',
    defaultTitle: '5-Axis CNC Precision Machining Center (Siemens 840D SL)',
    description: 'Precision German engineered machine tool with tool changer and high-pressure coolant system.',
    unit: 'Single Turnkey Unit',
    basePrice: 28_000_000_000,
    minIncrement: 200_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 120,
  },
];
