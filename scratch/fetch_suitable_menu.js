const fs = require('fs');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  }
  return res.json();
}

async function run() {
  const cafeId = "Gx8cIzXHxQDW5ZBSoLNS";
  const baseUrl = `https://firestore.googleapis.com/v1/projects/suitable-live/databases/(default)/documents/cafe/${cafeId}`;

  try {
    console.log("Fetching categories (menu)...");
    const menuList = await fetchJson(`${baseUrl}/menu`);
    
    if (!menuList.documents) {
      console.log("No categories found!");
      return;
    }

    const categories = [];

    for (const doc of menuList.documents) {
      const categoryId = doc.name.split('/').pop();
      const fields = doc.fields || {};
      
      const categoryName = fields.name ? fields.name.stringValue : categoryId;
      const order = fields.order ? parseInt(fields.order.integerValue || fields.order.doubleValue || '0') : 99;
      const icon = fields.icon ? fields.icon.stringValue : 'salad';

      console.log(`Found category: ${categoryName} (${categoryId})`);

      // Fetch products in this category (prepend firestore host)
      const productsUrl = `https://firestore.googleapis.com/v1/${doc.name}/products`;
      let productsList;
      try {
        productsList = await fetchJson(productsUrl);
      } catch (e) {
        console.log(`  Failed to fetch products for ${categoryName}:`, e.message);
        productsList = { documents: [] };
      }

      const products = [];
      if (productsList.documents) {
        for (const pDoc of productsList.documents) {
          const productId = pDoc.name.split('/').pop();
          const pFields = pDoc.fields || {};

          // Extract product details
          const name = pFields.name ? pFields.name.stringValue : 'Bilinmeyen Ürün';
          const price = pFields.price ? parseFloat(pFields.price.doubleValue || pFields.price.integerValue || '0') : 0;
          const description = pFields.description ? pFields.description.stringValue : '';
          const image = pFields.image ? pFields.image.stringValue : '';
          const popular = pFields.popular ? pFields.popular.booleanValue : false;
          const status = pFields.status ? pFields.status.stringValue : 'active';
          
          // Parse options if any
          const options = [];
          if (pFields.options && pFields.options.arrayValue && pFields.options.arrayValue.values) {
            pFields.options.arrayValue.values.forEach(v => {
              if (v.mapValue && v.mapValue.fields) {
                const optFields = v.mapValue.fields;
                options.push({
                  name: optFields.name ? optFields.name.stringValue : '',
                  price: optFields.price ? parseFloat(optFields.price.doubleValue || optFields.price.integerValue || '0') : 0
                });
              }
            });
          }

          products.push({
            id: productId,
            name,
            price,
            description,
            image,
            popular,
            status,
            options
          });
        }
      }

      categories.push({
        id: categoryId,
        name: categoryName,
        order,
        icon,
        products
      });
    }

    // Sort categories by order
    categories.sort((a, b) => a.order - b.order);

    fs.writeFileSync('scratch/menu_data.json', JSON.stringify(categories, null, 2));
    console.log("Menu data successfully written to scratch/menu_data.json");

  } catch (error) {
    console.error("Error occurred:", error);
  }
}

run();
