import { connectIdentity } from '@ads/e2e-kit';

// Register the product with the test sign-in service once, before any test signs in.
export default async function globalSetup() {
  const ads = connectIdentity();
  try {
    await ads.registerClient({
      clientId: 'sample-web',
      name: 'ADS Sample Product',
      redirectUris: [`http://localhost:${process.env.SAMPLE_PORT ?? 4100}/`],
      selfRoles: [], // staff-only product: an admin must grant roles (seeded per test)
      personal: false,
    });
  } finally {
    await ads.close();
  }
}
