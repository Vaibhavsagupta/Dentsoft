/**
 * SOHAR DENTAL LAB — Production Regression & Integration Test Suite
 * Validates Security, Atomic Sequences, Pagination, CRUD, and Health Probes.
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
let authToken = '';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Starting SOHAR DENTAL LAB Production Test Suite');
  console.log(`🔗 Target URL: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`⏳ Testing: ${name}... `);
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log('❌ FAILED');
      console.error(`   Error: ${err.response?.data?.error || err.message}`);
      failed++;
    }
  }

  // 1. Health Probe
  await test('Health Check Probe (/healthz)', async () => {
    const res = await axios.get(`${BASE_URL}/healthz`);
    if (res.status !== 200 || res.data.status !== 'ok') {
      throw new Error(`Unexpected health status: ${JSON.stringify(res.data)}`);
    }
  });

  // 2. Authentication & JWT Security
  await test('Auth Login & JWT Issuance', async () => {
    const res = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'soharadmin',
      password: 'soharadmin'
    });
    if (!res.data.token) {
      throw new Error('Login failed to return JWT token');
    }
    authToken = res.data.token;
  });

  await test('Protected Route Security (Unauthorized Rejection)', async () => {
    try {
      await axios.get(`${BASE_URL}/api/clients/next-code`);
      throw new Error('Protected route should have rejected unauthenticated request');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        return; // Expected
      }
      throw err;
    }
  });

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${authToken}` } });

  // 3. PostgreSQL Atomic Sequences
  await test('PostgreSQL Atomic Sequence — Orders (No Collisions)', async () => {
    const clientsRes = await axios.get(`${BASE_URL}/api/clients?simple=true`, authHeaders());
    const clientId = clientsRes.data[0]?.id;
    if (!clientId) throw new Error('No client found for order test');

    const ordersToCreate = 3;
    const promises = Array.from({ length: ordersToCreate }, (_, i) =>
      axios.post(
        `${BASE_URL}/api/orders`,
        {
          clientId,
          patientName: `Auto Test Patient Sequence ${Date.now()} ${i}`,
          productType: 'PFM',
          productName: 'PFM Crown',
          units: 1,
          price: 15
        },
        authHeaders()
      )
    );

    const results = await Promise.all(promises);
    const orderNumbers = results.map(r => Number(r.data.orderNumber));
    
    // Check consecutive numbers
    orderNumbers.sort((a, b) => a - b);
    for (let i = 1; i < orderNumbers.length; i++) {
      if (orderNumbers[i] !== orderNumbers[i - 1] + 1) {
        throw new Error(`Order numbers not consecutive: ${orderNumbers.join(', ')}`);
      }
    }
  });

  // 4. Server-Side Pagination
  await test('Server-Side Pagination — /api/clients', async () => {
    const res = await axios.get(`${BASE_URL}/api/clients?page=1&limit=5&paginate=true`, authHeaders());
    if (!res.data.pagination || res.data.data.length > 5) {
      throw new Error('Pagination envelope or limit invalid');
    }
    if (!res.headers['x-total-count']) {
      throw new Error('Missing X-Total-Count header');
    }
  });

  await test('Server-Side Pagination — /api/invoices', async () => {
    const res = await axios.get(`${BASE_URL}/api/invoices?page=1&limit=10&paginate=true`, authHeaders());
    if (!res.data.pagination || !Array.isArray(res.data.data)) {
      throw new Error('Invalid invoice pagination response');
    }
    if (Number(res.headers['x-total-count']) < 1) {
      throw new Error('Expected invoices in database');
    }
  });

  await test('Server-Side Pagination — /api/orders', async () => {
    const res = await axios.get(`${BASE_URL}/api/orders?page=2&limit=5&paginate=true`, authHeaders());
    if (res.data.pagination.page !== 2 || res.data.data.length > 5) {
      throw new Error('Order page 2 pagination mismatch');
    }
  });

  // 5. Inventory Transactions & ACID stock updates
  await test('Inventory Transaction ACID Stock Update', async () => {
    const materials = await axios.get(`${BASE_URL}/api/materials?search=3D`, authHeaders());
    const mat = materials.data[0];
    if (!mat) throw new Error('Material not found for inventory test');

    const stockBefore = mat.stock;
    const qtyToAdd = 3;

    await axios.post(
      `${BASE_URL}/api/inventory/transactions`,
      {
        type: 'Inward',
        materialId: mat.id,
        quantity: qtyToAdd,
        docNumber: `TEST-${Date.now()}`,
        supplier: 'Auto Test Supplier',
        notes: 'Automated test suite inward'
      },
      authHeaders()
    );

    const updatedMaterials = await axios.get(`${BASE_URL}/api/materials?search=${encodeURIComponent(mat.name)}`, authHeaders());
    const updatedMat = updatedMaterials.data.find(m => m.id === mat.id);
    if (!updatedMat || updatedMat.stock !== stockBefore + qtyToAdd) {
      throw new Error(`Stock did not update correctly: expected ${stockBefore + qtyToAdd}, got ${updatedMat?.stock}`);
    }
  });

  // 6. Delivery Plans (No Hang Test)
  await test('Delivery Plans Response Time (<500ms)', async () => {
    const start = Date.now();
    const res = await axios.post(
      `${BASE_URL}/api/delivery-plans`,
      {
        route: 'Test Route Express',
        status: 'Scheduled',
        planDate: new Date().toISOString().split('T')[0]
      },
      authHeaders()
    );
    const duration = Date.now() - start;
    if (duration > 500) {
      throw new Error(`Delivery plan took too long: ${duration}ms`);
    }
    if (!res.data.id) {
      throw new Error('Failed to create delivery plan');
    }
  });

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} Passed | ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
