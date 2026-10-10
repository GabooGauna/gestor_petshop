import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/types/database.types';
import { E2E_EMAIL, E2E_PASSWORD, skipUnlessRealAuth } from '../support/e2e';

const url = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test.describe('RLS real — matriz no mutante', () => {
  test('anon no puede leer tablas públicas después del cutover', async () => {
    test.skip(!url || !anonKey, 'Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
    const anonymous = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anonymous.from('products').select('id').limit(1);
    expect(error, 'anon todavía puede consultar products; falta aplicar la migración 005').not.toBeNull();
  });

  test('authenticated puede leer las nueve tablas', async ({ request }, testInfo) => {
    void request;
    skipUnlessRealAuth(testInfo);
    test.skip(!url || !anonKey, 'Requiere configuración Supabase.');
    const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { error: authError } = await client.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD });
    expect(authError).toBeNull();
    const tables = ['categories', 'suppliers', 'products', 'product_presentations', 'sales', 'sale_items', 'purchases', 'purchase_items', 'inventory_movements'] as const;
    for (const table of tables) {
      const { error } = await client.from(table).select('*', { head: true, count: 'exact' });
      expect(error, `authenticated no pudo leer ${table}`).toBeNull();
    }
    await client.auth.signOut();
  });
});
