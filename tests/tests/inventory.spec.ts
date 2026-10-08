import { test, expect } from '@playwright/test';
import { supabase } from '../../src/lib/supabase';
import { purchaseService } from '../../src/services/purchases';
import { productService } from '../../src/services/productService';

test.describe('Inventory & Purchases Integration', () => {
  test('debe registrar una compra y calcular el stock exacto (10 bolsas x 20kg = 200kg)', async () => {
    const timestamp = Date.now();
    
    // 1. Create a supplier
    const { data: supplier, error: supError } = await supabase
      .from('suppliers')
      .insert({ name: `Test Supplier ${timestamp}` })
      .select()
      .single();
    expect(supError).toBeNull();
    
    // 2. Create a category
    const { data: category } = await supabase
      .from('categories')
      .insert({ name: `Test Cat ${timestamp}` })
      .select()
      .single();
      
    // 3. Create a product
    const product = await productService.createProduct({
      name: `Dog Chow Test ${timestamp}`,
      category_id: category!.id,
      type: 'weight'
    });
    
    // 4. Create a presentation (Bolsa de 20kg, initial stock 0)
    const presentation = await productService.createPresentation({
      product_id: product.id,
      name: 'Bolsa 20 kg',
      weight_kg: 20,
      cost: 0,
      price: 0,
      stock: 0
    });
    
    // 5. Register a purchase: 10 bolsas of 20kg each. Cost per bag = 25000. Total = 250000.
    const purchase = await purchaseService.processPurchase(
      supplier!.id,
      250000,
      `INV-${timestamp}`,
      [{
        product_id: product.id,
        presentation_id: presentation.id,
        quantity: 10,
        unit_cost: 25000,
        subtotal: 250000
      }]
    );
    expect(purchase).toBeDefined();

    // 6. Verify the stock was incremented to exactly 200
    const { data: updatedPresentation, error: presError } = await supabase
      .from('product_presentations')
      .select('stock, cost')
      .eq('id', presentation.id)
      .single();
      
    expect(presError).toBeNull();
    // 10 bags * 20 kg = 200 kg exactly
    expect(updatedPresentation!.stock).toBe(200);
    expect(updatedPresentation!.cost).toBe(25000); // Updated to latest cost
    
    // Cleanup
    await supabase.from('suppliers').delete().eq('id', supplier!.id);
    await supabase.from('categories').delete().eq('id', category!.id);
  });
});
