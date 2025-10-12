import { supabaseAdmin } from "./supabase";

async function createAdminProfile() {
  const email = "nadeem.mohammed@deffinity.com";
  
  console.log(`\n🔧 Setting up admin profile for ${email}...\n`);

  try {
    // 1. Get user ID from Supabase Auth
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("❌ Failed to list users:", listError.message);
      return;
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User ${email} not found in Supabase Auth`);
      console.log("\n💡 Make sure the user has signed up first!");
      return;
    }

    const userId = user.id;
    console.log(`✅ Found user: ${userId}`);

    // 2. Create/update admin profile
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      role: "admin",
      full_name: "Nadeem Mohammed",
      phone: "+27 11 123 4567",
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

    if (profileError) {
      console.error(`❌ Failed to create profile: ${profileError.message}`);
      return;
    }

    console.log(`✅ Admin profile created!`);
    console.log(`\n🎉 ${email} is now an ADMIN!`);
    console.log(`\n💡 Sign out and sign in again to access the admin dashboard.\n`);

  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

createAdminProfile();
