import { isSupabaseConfigured, supabase } from "./supabase.js";

const pageType = document.body.dataset.authPage;
const loginForm = document.querySelector("#loginForm");
const authMessage = document.querySelector("#authMessage");
const logoutButtons = document.querySelectorAll("[data-auth-action='logout']");
const userEmail = document.querySelector("#userEmail");

function setMessage(message, type = "info") {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message;
  authMessage.dataset.type = type;
  authMessage.hidden = !message;
}

function setLoading(isLoading) {
  const submitButton = loginForm?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Signing in..." : "Sign in";
  }
}

function redirectToLogin() {
  window.location.replace("login.html");
}

function redirectToDashboard() {
  window.location.replace("index.html");
}

async function getSession() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Unable to read Supabase session:", error.message);
    return null;
  }

  return data.session;
}

async function protectPage() {
  const session = await getSession();

  if (pageType === "private" && !session) {
    redirectToLogin();
    return;
  }

  if (pageType === "login" && session) {
    redirectToDashboard();
    return;
  }

  if (userEmail && session?.user?.email) {
    userEmail.textContent = session.user.email;
  }

  document.body.classList.remove("auth-loading");

  if (!isSupabaseConfigured) {
    setMessage("Add your Supabase publishable key in assets/js/supabase.js to enable sign in.", "warning");
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isSupabaseConfigured) {
    setMessage("Supabase is missing the publishable key in assets/js/supabase.js.", "error");
    return;
  }

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    setMessage("Enter both email and password.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  setLoading(false);

  if (error) {
    setMessage(error.message, "error");
    return;
  }

  redirectToDashboard();
});

logoutButtons.forEach((logoutButton) => {
  logoutButton.addEventListener("click", async () => {
    logoutButtons.forEach((button) => {
      button.disabled = true;
    });

    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Unable to sign out:", error.message);
        logoutButtons.forEach((button) => {
          button.disabled = false;
        });
        return;
      }
    }

    redirectToLogin();
  });
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" && pageType === "private") {
    redirectToLogin();
  }

  if (event === "SIGNED_IN" && pageType === "login" && session) {
    redirectToDashboard();
  }
});

protectPage();
