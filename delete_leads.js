const { run } = require('./src/db/database');

async function removeLeads() {
  const idsToDelete = [5, 12];
  console.log('Deleting lead IDs:', idsToDelete);

  for (const id of idsToDelete) {
    await run("DELETE FROM outreach_jobs WHERE lead_id = ?", [id]);
    await run("DELETE FROM activity_logs WHERE lead_id = ?", [id]);
    await run("DELETE FROM leads WHERE id = ?", [id]);
  }

  console.log('✅ Deleted IDs 5 and 12!');
}

removeLeads().catch(console.error);
