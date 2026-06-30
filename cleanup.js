const { run, initDb } = require('./src/db/database');

async function cleanup() {
  try {
    // We should delete outreach_jobs linked to these leads first because the schema might not have ON DELETE CASCADE
    // Get the IDs first
    const { all } = require('./src/db/database');
    const emptyLeads = await all("SELECT id FROM leads WHERE first_name = '' AND last_name = ''");
    const dupLeads = await all("SELECT id FROM leads WHERE first_name = 'kannan' AND last_name = 'gokul' AND id != 4");
    const dupCampaigns = await all("SELECT id FROM campaigns WHERE name = 'Campaign 27/6/2026' AND id != 2");

    const leadIdsToDelete = [...emptyLeads, ...dupLeads].map(r => r.id);
    const campaignIdsToDelete = dupCampaigns.map(r => r.id);

    console.log('Deleting leads:', leadIdsToDelete);
    console.log('Deleting campaigns:', campaignIdsToDelete);

    for (const id of leadIdsToDelete) {
      await run("DELETE FROM outreach_jobs WHERE lead_id = ?", [id]);
      await run("DELETE FROM activity_logs WHERE lead_id = ?", [id]);
      await run("DELETE FROM leads WHERE id = ?", [id]);
    }

    for (const id of campaignIdsToDelete) {
      // Need to delete leads associated with this campaign first, but maybe there are none since they are empty duplicates
      const leadsInCamp = await all("SELECT id FROM leads WHERE campaign_id = ?", [id]);
      for (const l of leadsInCamp) {
         await run("DELETE FROM outreach_jobs WHERE lead_id = ?", [l.id]);
         await run("DELETE FROM activity_logs WHERE lead_id = ?", [l.id]);
         await run("DELETE FROM leads WHERE id = ?", [l.id]);
      }
      await run("DELETE FROM campaigns WHERE id = ?", [id]);
    }

    console.log('✅ Cleanup complete!');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

cleanup();
