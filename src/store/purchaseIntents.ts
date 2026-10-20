import { Platform } from 'react-native';
import {
  finishTransaction,
  purchaseErrorListener,
  purchaseUpdatedListener,
  type Purchase,
} from 'react-native-iap';
import { PRODUCT_ID } from '../game/constants';
import { useGame } from './useGame';

const completions = new Map<string, Promise<boolean>>();
let started = false;

/** Finish a Black Label transaction once, even if two listeners see it. */
export function completeStorePurchase(purchase: Purchase): Promise<boolean> {
  if (purchase.productId !== PRODUCT_ID || purchase.purchaseState === 'pending') {
    return Promise.resolve(false);
  }
  const key = purchase.transactionId ?? purchase.id;
  const existing = completions.get(key);
  if (existing) return existing;
  const pending = (async () => {
    try {
      await finishTransaction({ purchase, isConsumable: false });
      await useGame.getState().setOwned(true);
      return true;
    } catch {
      completions.delete(key);
      return false;
    }
  })();
  completions.set(key, pending);
  return pending;
}

/**
 * Grants Black Label after StoreKit finishes a purchase, including one that
 * started in the App Store. The purchase sheet itself is opened natively from
 * PurchaseIntent, so this does not start a second payment.
 */
export function startPurchaseIntents() {
  if (started || Platform.OS !== 'ios') return;
  started = true;

  purchaseUpdatedListener((purchase) => {
    void completeStorePurchase(purchase).then((granted) => {
      if (!granted || useGame.getState().purchasing) return;
      useGame.getState().setToast('Black Label unlocked.');
    });
  });

  purchaseErrorListener((error) => {
    if (error.code !== 'already-owned') return;
    void useGame.getState().setOwned(true);
    useGame.getState().setToast('Black Label is already purchased.');
  });
}
