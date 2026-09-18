// ===============================
// SUPABASE CONFIG
// ===============================
const SUPABASE_URL = "https://tpxlfubxxhlmqrdaywao.supabase.co";

const SUPABASE_ANON =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRweGxmdWJ4eGhsbXFyZGF5d2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4OTUzNzksImV4cCI6MjA5NjQ3MTM3OX0.ND4iqdVwzQibcfDNqjUXSXytS3ljfSFXHjKVhLfEoVs";

const { createClient } = supabase;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
window.sb = sb;

// backwards compatibility
const db = sb;


// ===============================
// AUTH
// ===============================

async function login(email, password) {
    return await sb.auth.signInWithPassword({
        email,
        password
    });
}

async function logout() {
    await sb.auth.signOut();
    location.href = "login.html";
}

async function signOut() {
    await logout();
}

async function getUser() {
    const {
        data: { user }
    } = await sb.auth.getUser();

    return user;
}

async function requireAdmin() {
    const user = await getUser();

    if (!user) {
        location.href = "login.html";
        return null;
    }

    return user;
}


// ===============================
// DATABASE HELPERS
// ===============================

async function getProjects() {
    const { data, error } =
        await sb
        .from("projects")
        .select("*")
        .order("created_at", { ascending:false });

    if(error) throw error;

    return data;
}

async function insertProject(project) {

    const { data, error } =
        await sb
        .from("projects")
        .insert(project)
        .select()
        .single();

    if(error) throw error;

    return data;
}

async function updateProject(id, values){

    const { data, error } =
        await sb
        .from("projects")
        .update(values)
        .eq("id",id)
        .select()
        .single();

    if(error) throw error;

    return data;
}

async function deleteProject(id){

    const { error } =
        await sb
        .from("projects")
        .delete()
        .eq("id",id);

    if(error) throw error;
}
// ===============================
// STORAGE
// ===============================

const BUCKET = {
  PROJECTS: "project-images"
};

async function uploadFile(file, folder = "gallery") {

  const ext = file.name.split(".").pop();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${folder}/${filename}`;

  const { error } = await sb.storage
    .from(BUCKET.PROJECTS)
    .upload(path, file, {
      upsert: true
    });

  if (error) throw error;

  const { data } = sb.storage
    .from(BUCKET.PROJECTS)
    .getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl
  };
}

async function deleteFile(path) {
  if (!path) return;

  const { error } = await sb.storage
    .from(BUCKET.PROJECTS)
    .remove([path]);

  if (error) throw error;
}