import { test, expect } from '@playwright/test';
import { supabase } from '../../src/lib/supabase';

test.describe('Supabase Integration', () => {
    test('debe conectar a Supabase e insertar/leer con UUIDs e integridad referencial', async () => {
        const testCategoryName = `Test Category ${Date.now()}`;
        
        // 1. Insert category
        const { data: category, error: catError } = await supabase
            .from('categories')
            .insert({ name: testCategoryName })
            .select()
            .single();
            
        expect(catError).toBeNull();
        expect(category).toBeDefined();
        expect(category!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        
        // 2. Insert product with category foreign key
        const testProductName = `Test Product ${Date.now()}`;
        const { data: product, error: prodError } = await supabase
            .from('products')
            .insert({
                name: testProductName,
                category_id: category!.id,
                type: 'unit'
            })
            .select()
            .single();
            
        expect(prodError).toBeNull();
        expect(product).toBeDefined();
        expect(product!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(product!.category_id).toBe(category!.id);
        
        // 3. Clean up
        await supabase.from('categories').delete().eq('id', category!.id);
    });
});
