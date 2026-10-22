import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../../server/infrastructure/audit-log.js';

const TEST_HMAC_SECRET = 'test-secret-at-least-32-chars-long-';

describe('Audit Log Hash-Chaining & Tamper Detection Tests', () => {
  it('appends records in sequence and verifies cryptographic integrity', async () => {
    const audit = new AuditLog(TEST_HMAC_SECRET);

    const rec0 = await audit.append('TRIP_STARTED', 'TRIP-AUDIT-01', 'SUPERVISOR', { origin: 'Kampala' });
    const rec1 = await audit.append('PROACTIVE_ALERT_RAISED', 'TRIP-AUDIT-01', 'WATCHER', { risk: 0.75 });
    const rec2 = await audit.append('ACTION_APPROVED', 'TRIP-AUDIT-01', 'DIRECTOR', { actionId: 'ACT-99' });

    assert.equal(rec0.sequence, 0);
    assert.equal(rec1.sequence, 1);
    assert.equal(rec2.sequence, 2);

    assert.equal(rec1.prevHash, rec0.hash);
    assert.equal(rec2.prevHash, rec1.hash);

    const records = audit.getRecords();
    const verification = audit.verifyChain(records);
    assert.equal(verification.valid, true);
  });

  it('detects tampering when payload is maliciously modified', async () => {
    const audit = new AuditLog(TEST_HMAC_SECRET);

    await audit.append('TRIP_STARTED', 'TRIP-TAMPER-01', 'SYSTEM', { init: true });
    await audit.append('ACTION_APPROVED', 'TRIP-TAMPER-01', 'SUPERVISOR', { approvedAction: 'DISPATCH_SMS' });

    const records = audit.getRecords();
    assert.equal(audit.verifyChain(records).valid, true);

    // Tamper with record #1 payload
    const tamperedRecords = JSON.parse(JSON.stringify(records));
    tamperedRecords[1].payload.approvedAction = 'MALICIOUS_UNAUTHORIZED_ACTION';

    const tamperedCheck = audit.verifyChain(tamperedRecords);
    assert.equal(tamperedCheck.valid, false);
    assert.equal(tamperedCheck.badRecordIndex, 1);
    assert.ok(tamperedCheck.reason?.includes('Tampered hash'));
  });

  it('detects tampering when a record is deleted or sequence altered', async () => {
    const audit = new AuditLog(TEST_HMAC_SECRET);

    await audit.append('TRIP_STARTED', 'TRIP-SEQ-01', 'SYSTEM', {});
    await audit.append('PROACTIVE_ALERT_RAISED', 'TRIP-SEQ-01', 'SYSTEM', {});
    await audit.append('TRIP_STOPPED', 'TRIP-SEQ-01', 'SYSTEM', {});

    const records = audit.getRecords();
    // Drop middle record
    const spliced = [records[0], records[2]];

    const verification = audit.verifyChain(spliced);
    assert.equal(verification.valid, false);
    assert.ok(verification.reason?.includes('Broken sequence') || verification.reason?.includes('Broken hash link'));
  });
});
