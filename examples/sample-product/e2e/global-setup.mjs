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
      // The product SERVER's secret for the admin API (invitations, granting roles). Test value only:
      // a real product keeps it in its server secrets, never in the browser or the repository.
      clientSecret: process.env.SAMPLE_ADMIN_CLIENT_SECRET ?? 'sample-web-e2e-only-secret',
      assignableRoles: ['notes_writer', 'notes_reader', 'cashier'],
    });
  } finally {
    await ads.close();
  }
}
