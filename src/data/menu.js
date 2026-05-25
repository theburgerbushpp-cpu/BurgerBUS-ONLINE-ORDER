export const business = {
  brand: 'The Burger Bus',
  cloverMode: 'production',
  location: {
    street: '15-1660 32nd Ave.',
    city: 'Keaau',
    state: 'HI',
    postalCode: '96749',
  },
  phone: '(808) 238-2528',
  pickupWaitMinutes: 25,
  deliveryPartners: ['UberEats', 'DoorDash'],
  payments: {
    pickup: ['cash', 'credit_card'],
    delivery: ['credit_card'],
  },
  rewards: {
    pointsPerDollar: 1,
    redemptionNote: 'Rewards points can be used later for free menu items.',
  },
};

export const menu = [
  {
    id: 'clv-item-bus-burger',
    name: 'Bus Burger',
    category: 'burgers',
    description: 'Signature smashed burger with Clover-powered modifiers and combo upsells.',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
    variants: [
      { id: 'clv-item-bus-burger-single', name: 'Single', price: 9.5, available: true, inventory: 24 },
      { id: 'clv-item-bus-burger-double', name: 'Double', price: 12.5, available: true, inventory: 18 },
      { id: 'clv-item-bus-burger-triple', name: 'Triple', price: 15.5, available: true, inventory: 12 },
      { id: 'clv-item-bus-burger-quadruple', name: 'Quadruple', price: 18.5, available: false, inventory: 0 },
    ],
    modifiers: [
      { id: 'clv-mod-burger-cheese', name: 'Extra Cheese', price: 1.25 },
      { id: 'clv-mod-burger-bacon', name: 'Applewood Bacon', price: 2.5 },
      { id: 'clv-mod-burger-onion', name: 'Grilled Onion', price: 0.75 },
    ],
    comboUpgrade: {
      id: 'clv-combo-burger',
      name: 'Upgrade combo with specialty fries',
      price: 4.5,
    },
  },
  {
    id: 'clv-item-golden-fries',
    name: 'Golden Fries',
    category: 'fries',
    description: 'Classic fries with size variants and specialty fry upgrade choices.',
    image: 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=900&q=80',
    variants: [
      { id: 'clv-item-golden-fries-small', name: 'Small', price: 4.0, available: true, inventory: 40 },
      { id: 'clv-item-golden-fries-large', name: 'Large', price: 6.0, available: true, inventory: 30 },
    ],
    modifiers: [
      { id: 'clv-mod-fries-garlic', name: 'Garlic Butter', price: 1.0 },
      { id: 'clv-mod-fries-kimchi', name: 'Kimchi Aioli', price: 1.5 },
    ],
    comboUpgrade: {
      id: 'clv-combo-fries',
      name: 'Specialty fries finish',
      price: 2.0,
    },
  },
  {
    id: 'clv-item-bus-shake',
    name: 'Bus Stop Shake',
    category: 'drinks',
    description: 'Sweet finish for app-based pickup or delivery orders.',
    image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80',
    variants: [
      { id: 'clv-item-bus-shake-regular', name: 'Regular', price: 5.75, available: true, inventory: 20 },
    ],
    modifiers: [],
  },
];
