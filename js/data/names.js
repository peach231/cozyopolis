// Citizen name generator (cozy storybook flavor).
(() => {
const G = globalThis.G ??= {};

const FIRST = [
  'Mabel', 'Otis', 'Hazel', 'Bram', 'Wren', 'Felix', 'Ida', 'Jasper', 'Posy',
  'Gus', 'Marigold', 'Ned', 'Clover', 'Ezra', 'Tilly', 'Ham', 'Birdie', 'Cole',
  'Fern', 'Albie', 'Nora', 'Pip', 'Greta', 'Sol', 'June', 'Bertie', 'Olive',
  'Rufus', 'Sadie', 'Wally', 'Pearl', 'Monty', 'Iris', 'Chester', 'Lottie',
  'Hugo', 'Dot', 'Stan', 'Effie', 'Ruben', 'Maeve', 'Arlo', 'Bess', 'Cyrus',
];
const LAST = [
  'Hart', 'Bramble', 'Tinker', 'Mossworth', 'Pudding', 'Fairweather', 'Cobble',
  'Thistle', 'Marrow', 'Plum', 'Whistler', 'Honeycutt', 'Gable', 'Fothering',
  'Quill', 'Saffron', 'Bellow', 'Crumb', 'Dapple', 'Elderberry',
  'Finch', 'Garland', 'Hollyhock', 'Inkwell', 'Juniper', 'Kettle', 'Lantern',
  'Meadows', 'Nutmeg', 'Oakes', 'Periwinkle', 'Rook', 'Sorrel', 'Tansy', 'Wick',
];

G.Names = {
  person: (rng) => `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
  FIRST, LAST,
};
})();
