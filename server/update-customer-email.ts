import { supabaseAdmin } from "./supabase";

async function updateCustomerEmail() {
  const oldEmail = "customer@easyfuel.ai";
  const newEmail = "nadeem.mohammed@deffinity.com";

  console.log(`\n🔄 Updating customer email...`);
  console.log(`From: ${oldEmail}`);
  console.log(`To: ${newEmail}\n`);

  try {
    // Find the user with the old email
    let userId: string | null = null;
    let page = 1;
    
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

    // Update the email using admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail }
    );

    if (error) {
      console.error(`❌ Error updating email: ${error.message}`);
      process.exit(1);
    }

    console.log(`✅ Email updated successfully!`);
    console.log(`\nUser Details:`);
    console.log(`  ID: ${data.user.id}`);
    console.log(`  Email: ${data.user.email}`);
    console.log(`  Confirmed: ${data.user.email_confirmed_at ? 'Yes' : 'No'}`);
    
    console.log(`\n✨ You can now sign in with: ${newEmail}`);
    console.log(`💡 Set a password in Supabase Dashboard or use magic link\n`);

  } catch (error: any) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

updateCustomerEmail();
