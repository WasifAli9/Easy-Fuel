import { supabaseAdmin } from "./supabase";

async function updateCustomerEmail() {
  const oldEmail = "customer@easyfuel.ai";
  const newEmail = "nadeem.mohammed@deffinity.com";

  console.log(`\n🔄 Updating customer email...`);
  console.log(`From: ${oldEmail}`);
  console.log(`To: ${newEmail}\n`);

  try {
    // First check if new email already exists
    console.log(`Checking if ${newEmail} already exists...`);
    let page = 1;
    let existingUser = null;
    
    while (!existingUser && page <= 10) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      existingUser = data?.users.find(u => u.email === newEmail);
      if (existingUser || !data?.users || data.users.length === 0) break;
      page++;
    }

    if (existingUser) {
      console.log(`⚠️  Email ${newEmail} already exists (User ID: ${existingUser.id})`);
      console.log(`\n✅ You can already sign in with: ${newEmail}`);
      return;
    }

    // Find the user with the old email
    let userId: string | null = null;
    page = 1;
    
    while (!userId && page <= 10) {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      const user = data?.users.find(u => u.email === oldEmail);
      
      if (user) {
        userId = user.id;
        console.log(`✅ Found user: ${userId}`);
        break;
      }
      
      if (!data?.users || data.users.length === 0) break;
      page++;
    }

    if (!userId) {
      console.error(`❌ User with email ${oldEmail} not found`);
      process.exit(1);
    }

    // Update the email with email_confirm flag
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { 
        email: newEmail,
        email_confirm: true  // Auto-confirm the new email
      }
    );

    if (error) {
      console.error(`❌ Error updating email: ${error.message}`);
      console.error(`Full error:`, error);
      process.exit(1);
    }

    console.log(`✅ Email updated successfully!`);
    console.log(`\nUser Details:`);
    console.log(`  ID: ${data.user.id}`);
    console.log(`  Email: ${data.user.email}`);
    console.log(`  Email Confirmed: ${data.user.email_confirmed_at ? 'Yes' : 'No'}`);
    
    console.log(`\n✨ You can now sign in with: ${newEmail}`);
    console.log(`💡 Use Password tab (set password in Dashboard) or Magic Link tab\n`);

  } catch (error: any) {
    console.error(`❌ Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

updateCustomerEmail();
