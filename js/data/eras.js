// Era progression: population milestones unlock building tiers. The city's era
// only ever rises (G.city.eraIndex), even if population later dips.
(() => {
const G = globalThis.G ??= {};

G.Eras = {
  list: [
    { id: 'hamlet', name: 'Hamlet', pop: 0 },
    { id: 'village', name: 'Village', pop: 50 },
    { id: 'town', name: 'Town', pop: 250 },
    { id: 'city', name: 'City', pop: 1000 },
    { id: 'metropolis', name: 'Metropolis', pop: 5000 },
  ],
  indexOf: (id) => G.Eras.list.findIndex((e) => e.id === id),
  current: () => G.Eras.list[G.city.eraIndex ?? 0],
  next: () => G.Eras.list[(G.city.eraIndex ?? 0) + 1] ?? null,
};

// what the growth sim spontaneously builds on zoned land, by era and zone
// type (1 res, 2 commercial, 3 farmland). Only 1x1 footprints here —
// multi-tile structures are player-placed.
G.Eras.growth = {
  hamlet: { res: ['cottage_a', 'cottage_b', 'cottage_c'], com: ['stall'], farm: ['field_wheat', 'field_greens'] },
  village: { res: ['house_a', 'house_b', 'cottage_b'], com: ['bakery', 'stall', 'cafe'], farm: ['field_wheat', 'field_greens'] },
  town: { res: ['townhouse_a', 'townhouse_b', 'house_a'], com: ['store', 'workshop', 'cafe'], farm: ['field_greens', 'field_wheat'] },
  city: { res: ['apartment_a', 'apartment_b', 'townhouse_b'], com: ['office', 'store', 'cinema'], farm: ['field_greens', 'field_wheat'] },
  metropolis: { res: ['tower_a', 'tower_b', 'apartment_a'], com: ['officetower', 'boutique', 'cinema'], farm: ['field_greens', 'field_wheat'] },
};

// residential upgrade chains (level-ups when land value is high and era allows)
G.Eras.upgrades = {
  cottage_a: 'house_a', cottage_b: 'house_b', cottage_c: 'house_a',
  house_a: 'townhouse_a', house_b: 'townhouse_b',
  townhouse_a: 'apartment_a', townhouse_b: 'apartment_b',
  apartment_a: 'tower_a', apartment_b: 'tower_b',
  stall: 'bakery', bakery: 'store', cafe: 'store', store: 'office', office: 'officetower',
};
})();
