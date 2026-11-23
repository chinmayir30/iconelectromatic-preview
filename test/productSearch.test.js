import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../shared/catalogData.js';
import { searchProducts, getAllProductsFlattened, renderProductsPage } from '../src/pages/Products.js';

// Flatten catalog helper for unit tests
function getTestProducts() {
  const products = [];
  CATALOG.forEach(oem => {
    (oem.categories || []).forEach(cat => {
      (cat.products || []).forEach(p => {
        products.push({
          ...p,
          categoryId: cat.id,
          categoryName: cat.name,
          oemId: oem.id,
          oemName: oem.name,
          oemShort: oem.shortName || oem.name,
          oemAccent: oem.accentColor || '#2563EB',
          oemDefaultImage: oem.defaultImage || '',
          oemSpecialty: oem.specialty || ''
        });
      });
    });
  });
  return products;
}

test('searchProducts with "RT?duiode" finds RT/duroid products under Rogers Corporation', () => {
  const products = getTestProducts();
  const results = searchProducts(products, 'RT?duiode');

  assert.ok(results.length >= 5, `Expected at least 5 results, got ${results.length}`);
  const rogersDuroids = results.filter(p => p.oemName === 'Rogers Corporation' && p.name.includes('RT/duroid'));
  assert.equal(rogersDuroids.length, 7, 'Expected 7 RT/duroid models from Rogers');

  const names = results.map(p => p.name);
  assert.ok(names.includes('RT/duroid 5880'));
  assert.ok(names.includes('RT/duroid 5870'));
  assert.ok(names.includes('RT/duroid 6002'));
});

test('searchProducts with "RT/duroid" and "RT duroid" returns identical matching products', () => {
  const products = getTestProducts();
  const slashResults = searchProducts(products, 'RT/duroid');
  const spaceResults = searchProducts(products, 'RT duroid');

  assert.equal(slashResults.length, 7);
  assert.equal(spaceResults.length, 7);
  assert.deepEqual(
    slashResults.map(p => p.id),
    spaceResults.map(p => p.id)
  );
});

test('searchProducts with part number "5880" matches RT/duroid 5880 and 5880LZ first', () => {
  const products = getTestProducts();
  const results = searchProducts(products, '5880');

  assert.ok(results.length >= 2);
  assert.equal(results[0].name, 'RT/duroid 5880');
  assert.equal(results[1].name, 'RT/duroid 5880LZ');
});

test('searchProducts with "RO4350B" returns RO4350B laminate directly', () => {
  const products = getTestProducts();
  const results = searchProducts(products, 'RO4350B');

  assert.ok(results.length >= 1);
  assert.equal(results[0].name, 'RO4350B');
  assert.equal(results[0].oemName, 'Rogers Corporation');
  assert.equal(results[0].id, 'ro4350b-9');
});

test('searchProducts with "TC350" returns TC350 and TC350 Plus', () => {
  const products = getTestProducts();
  const results = searchProducts(products, 'TC350');

  assert.ok(results.length >= 2);
  const names = results.slice(0, 2).map(p => p.name);
  assert.ok(names.includes('TC350'));
  assert.ok(names.includes('TC350 Plus'));
});

test('searchProducts matches products across diverse OEMs', () => {
  const products = getTestProducts();

  // TecDia
  const tecDia = searchProducts(products, 'Capacitors');
  assert.ok(tecDia.some(p => p.oemName === 'TecDia' && p.name.includes('Capacitors')));

  // Qorvo
  const qorvo = searchProducts(products, 'Power Amplifiers');
  assert.ok(qorvo.some(p => p.oemName === 'Qorvo' && p.name.includes('Power Amplifiers')));

  // TriTeq
  const triTeq = searchProducts(products, 'Harmonic');
  assert.ok(triTeq.some(p => p.oemName === 'TriTeq' && p.name.includes('Harmonic')));

  // Fortify
  const fortify = searchProducts(products, 'Radix');
  assert.ok(fortify.some(p => p.oemName === 'Fortify' && p.name.includes('Radix')));

  // Ohmega Ticer
  const ohmega = searchProducts(products, 'OhmegaPly');
  assert.ok(ohmega.length >= 10);
  assert.ok(ohmega.every(p => p.oemName === 'Ohmega Ticer'));
});

test('searchProducts with non-existent query returns empty array', () => {
  const products = getTestProducts();
  const results = searchProducts(products, 'nonexistent-xyz-part-12345');
  assert.equal(results.length, 0);
});

test('searchProducts with empty query returns empty array', () => {
  const products = getTestProducts();
  assert.deepEqual(searchProducts(products, ''), []);
  assert.deepEqual(searchProducts(products, '   '), []);
});

test('searchProducts handles special characters without regex errors', () => {
  const products = getTestProducts();
  // Ensure characters like ?, *, +, [, ], (, ), \, ^, $ do not throw
  assert.doesNotThrow(() => {
    searchProducts(products, 'RT?duroid');
    searchProducts(products, 'OhmegaPly®');
    searchProducts(products, 'Radix™');
    searchProducts(products, '***???+++');
    searchProducts(products, '[test]');
  });
});

test('searchProducts filters by OEM specialty when activeSpecialty is specified', () => {
  const products = getTestProducts();
  // Filter by Fortify's specialty
  const fortifySpecialty = products.find(p => p.oemName === 'Fortify')?.oemSpecialty;
  assert.ok(fortifySpecialty);

  const results = searchProducts(products, 'Lens', fortifySpecialty);
  assert.ok(results.length > 0);
  assert.ok(results.every(p => p.oemSpecialty === fortifySpecialty));
});

test('search results display product cards with /product/:id link and RFQ navigation', () => {
  const products = getTestProducts();
  const results = searchProducts(products, 'RT/duroid 5880');
  assert.ok(results.length > 0);

  const product = results[0];
  assert.equal(product.name, 'RT/duroid 5880');
  assert.equal(product.oemName, 'Rogers Corporation');

  const detailUrl = `/product/${encodeURIComponent(product.id)}`;
  const rfqUrl = `/contact?subject=rfq&model=${encodeURIComponent(product.name)}&product=${encodeURIComponent(product.name)}&oem=${encodeURIComponent(product.oemName)}`;

  assert.equal(detailUrl, '/product/rt-duroid-5880-2');
  assert.ok(rfqUrl.includes('model=RT%2Fduroid%205880'));
  assert.ok(rfqUrl.includes('oem=Rogers%20Corporation'));
});
