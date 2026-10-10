import { expect, test } from '@playwright/test';
import { supabase } from '../../src/lib/supabase';
import { E2E_EMAIL, E2E_PASSWORD, skipUnlessRealAuth } from '../support/e2e';

test.describe('Inventario real — auditoría de solo lectura', () => {
  test('cada stock coincide con la suma de su Kardex', async ({ request }, testInfo) => {
    void request;
    skipUnlessRealAuth(testInfo);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD });
    expect(authError).toBeNull();
    try {
      const [{ data: presentations, error: stockError }, { data: movements, error: movementError }] = await Promise.all([
        supabase.from('product_presentations').select('id,stock'),
        supabase.from('inventory_movements').select('presentation_id,quantity'),
      ]);
      expect(stockError).toBeNull();
      expect(movementError).toBeNull();
      const totals = new Map<string, number>();
      for (const movement of movements ?? []) {
        if (movement.presentation_id) totals.set(movement.presentation_id, (totals.get(movement.presentation_id) ?? 0) + Number(movement.quantity));
      }
      for (const presentation of presentations ?? []) {
        expect(Number(presentation.stock), `Kardex inconsistente para ${presentation.id}`).toBeCloseTo(totals.get(presentation.id) ?? 0, 3);
      }
    } finally {
      await supabase.auth.signOut();
    }
  });
});
