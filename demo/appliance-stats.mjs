// Counts how many recipes need each appliance, from the live compiled API.
const API = "https://website-business-beta.vercel.app/api/recipes/compiled";
let j = null;
for (let i = 0; i < 20; i++) {
  j = await (await fetch(API)).json();
  if (j.recipes?.some((r) => Array.isArray(r.appliances))) break;
  console.log("waiting for deploy…"); await new Promise((r) => setTimeout(r, 20000));
}
const shown = j.recipes.filter((r) => !r.hidden && !r.isArticle && !r.isCollection);
const counts = {};
let none = 0;
for (const r of shown) {
  if (!r.appliances?.length) none++;
  for (const a of r.appliances || []) counts[a] = (counts[a] || 0) + 1;
}
console.log(`recipes: ${shown.length}; stove only: ${none} (${(100 * none / shown.length).toFixed(1)}%)`);
for (const [a, n] of Object.entries(counts).sort((x, y) => y[1] - x[1])) console.log(`${a}: ${n} (${(100 * n / shown.length).toFixed(1)}%)`);
