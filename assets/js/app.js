const routes = {
  dashboard: {
    title: "Dashboard",
    eyebrow: "Kennel operations",
    render: () => `
      <section class="hero-panel" aria-label="Dashboard overview">
        <div class="summary-card">
          <p class="eyebrow">Command center</p>
          <h2>Premium kennel management, ready for real data.</h2>
          <p>Track dogs, puppies, breedings, productions, website inquiries, and customers from one focused operating dashboard.</p>
          <div class="quick-row">
            <div class="quick-stat"><strong>24</strong><span>Active dogs</span></div>
            <div class="quick-stat"><strong>6</strong><span>Upcoming breedings</span></div>
            <div class="quick-stat"><strong>11</strong><span>Available puppies</span></div>
            <div class="quick-stat"><strong>18</strong><span>Open leads</span></div>
          </div>
        </div>
        <aside class="panel">
          <h3>Today</h3>
          <div class="activity-list">
            <div class="activity-item"><div><strong>Health checks</strong><span>Review vaccination status for the current litter.</span></div></div>
            <div class="activity-item"><div><strong>Customer follow-up</strong><span>Three inquiries are waiting for a response.</span></div></div>
            <div class="activity-item"><div><strong>Website queue</strong><span>New gallery updates are staged as placeholders.</span></div></div>
            <div class="activity-item"><div><strong>Production notes</strong><span>Log outcomes once CRUD is introduced.</span></div></div>
          </div>
        </aside>
      </section>

      <section class="metric-grid" aria-label="Kennel metrics">
        <div class="metric-card"><strong>92%</strong><span>Record readiness</span><em>Prototype metric</em></div>
        <div class="metric-card"><strong>4</strong><span>Litters planned</span><em>Next 90 days</em></div>
        <div class="metric-card"><strong>31</strong><span>Customer profiles</span><em>Placeholder data</em></div>
        <div class="metric-card"><strong>8</strong><span>Website tasks</span><em>Needs content</em></div>
      </section>

      <section class="split-grid">
        <div class="panel table-shell">
          <h3>Recent activity</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Item</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dogs</td>
                <td>Champion profile cleanup</td>
                <td><span class="tag">Ready</span></td>
                <td>Admin</td>
              </tr>
              <tr>
                <td>Puppies</td>
                <td>Litter availability draft</td>
                <td><span class="tag">Queued</span></td>
                <td>Admin</td>
              </tr>
              <tr>
                <td>Website</td>
                <td>Homepage feature section</td>
                <td><span class="tag">Draft</span></td>
                <td>Admin</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel">
          <h3>Next build phases</h3>
          <div class="activity-list">
            <div class="activity-item"><div><strong>Authentication</strong><span>Deferred by request.</span></div></div>
            <div class="activity-item"><div><strong>CRUD modules</strong><span>Placeholder screens are ready for future forms and tables.</span></div></div>
            <div class="activity-item"><div><strong>Database</strong><span>Supabase can be wired later without changing the shell.</span></div></div>
          </div>
        </div>
      </section>
    `
  },
  dogs: page("Dogs", "Kennel roster", "Manage adult dog profiles, health records, pedigrees, photos, and availability once records are added.", ["Dog profiles", "Health timeline", "Pedigree overview"]),
  puppies: page("Puppies", "Litters and availability", "Prepare puppy listings, track development milestones, and organize reservation status in a future CRUD phase.", ["Litter cards", "Availability board", "Milestone tracker"]),
  breedings: page("Breedings", "Pairing planner", "Plan pairings, expected dates, notes, and breeding outcomes from a focused placeholder workspace.", ["Pairing schedule", "Heat cycle notes", "Outcome records"]),
  productions: page("Productions", "Production history", "Review production performance and future program notes when historical data is introduced.", ["Past litters", "Program notes", "Result summaries"]),
  website: page("Website", "Public website", "Coordinate homepage content, dog galleries, puppy listings, and inquiry flow from this section later.", ["Hero content", "Gallery queue", "Inquiry funnel"]),
  customers: page("Customers", "Client pipeline", "Organize leads, reservations, follow-ups, and customer communication when customer records are enabled.", ["Lead inbox", "Reservation status", "Follow-up tasks"]),
  settings: page("Settings", "System preferences", "Configure business details, notification preferences, team roles, and future integrations from here.", ["Kennel profile", "Team access", "Integrations"])
};

function page(title, eyebrow, description, cards) {
  return {
    title,
    eyebrow,
    render: () => `
      <section class="placeholder-card">
        <p class="eyebrow">${eyebrow}</p>
        <h2>${title}</h2>
        <p>${description}</p>
        <div class="placeholder-grid">
          ${cards.map((card) => `
            <div class="placeholder-item">
              <strong>${card}</strong>
              <span>This area is intentionally reserved for the next application phase.</span>
            </div>
          `).join("")}
        </div>
      </section>
    `
  };
}

const content = document.querySelector("#appContent");
const title = document.querySelector("#pageTitle");
const eyebrow = document.querySelector("#pageEyebrow");
const navItems = document.querySelectorAll("[data-route]");
const menuToggle = document.querySelector(".menu-toggle");

function setRoute(routeName) {
  const normalizedRoute = routes[routeName] ? routeName : "dashboard";
  const route = routes[normalizedRoute];

  title.textContent = route.title;
  eyebrow.textContent = route.eyebrow;
  content.innerHTML = route.render();

  navItems.forEach((item) => {
    const isActive = item.dataset.route === normalizedRoute;
    item.classList.toggle("is-active", isActive);
    if (item.tagName === "BUTTON") {
      item.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  if (window.location.hash !== `#${normalizedRoute}`) {
    history.replaceState(null, "", `#${normalizedRoute}`);
  }

  document.body.classList.remove("nav-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    setRoute(item.dataset.route);
  });
});

menuToggle?.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("nav-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

window.addEventListener("hashchange", () => {
  setRoute(window.location.hash.replace("#", "") || "dashboard");
});

setRoute(window.location.hash.replace("#", "") || "dashboard");
