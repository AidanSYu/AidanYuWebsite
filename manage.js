const fs = require('fs');
const path = require('path');
const readline = require('readline');

// The markup templates and the escaping policy are shared with the browser
// composer (dev-server.js), so both routes produce byte-identical posts.
const {
  escapeHtml,
  escapeAttr,
  sanitizeSlug,
  createPost,
} = require('./content');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function addBlogPost() {
  console.log('\n--- Add Blog Post ---');
  console.log('(For a form with a live preview instead, run: npm run dev, then open /admin)');
  const title = await ask('Post Title: ');
  if (!title.trim()) {
    console.log('Title cannot be empty.');
    return;
  }

  const defaultSlug = sanitizeSlug(title);
  const slugInput = await ask(`URL Slug [default: ${defaultSlug}]: `);
  const slug = sanitizeSlug(slugInput.trim() || defaultSlug);

  const today = new Date().toISOString().split('T')[0];
  const dateInput = await ask(`Publish Date (YYYY-MM-DD) [default: ${today}]: `);
  const date = dateInput.trim() || today;

  console.log('\nEnter your post body. Press Enter, then type DONE on a new line and press Enter to finish:');
  console.log('(Inline HTML such as <strong> is allowed here. A blank line starts a new paragraph.)');
  const lines = [];

  while (true) {
    const line = await ask('> ');
    if (line.trim() === 'DONE') break;
    lines.push(line);
  }

  // The blank-line-is-a-paragraph-break rule lives in content.js, so the typed
  // lines are passed through as one string rather than pre-grouped here.
  const body = lines.join('\n');

  let overwrite = false;
  if (slug && fs.existsSync(path.join(__dirname, 'blog', `${slug}.html`))) {
    const answer = await ask(`blog/${slug}.html already exists. Overwrite? (y/N): `);
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
    overwrite = true;
  }

  try {
    const result = createPost({ title, date, body, slug, overwrite });
    console.log(`${result.created ? 'Created' : 'Overwrote'}: ${result.file}`);
    if (result.created) console.log('Updated: blog.html list');
  } catch (err) {
    console.log(err.message);
  }
}

async function addProject() {
  console.log('\n--- Add Project ---');
  const name = await ask('Project Name: ');
  if (!name.trim()) return;

  const desc = await ask('Description (inline HTML allowed): ');
  const tagsInput = await ask('Tags (comma-separated, e.g. C++, Web, ESP32): ');
  const demoLink = await ask('Demo Link (optional): ');
  const sourceLink = await ask('Source Code Link (optional): ');

  const tags = tagsInput.split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const tagsHtml = tags.map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join('\n            ');

  const links = [];
  if (demoLink.trim()) {
    links.push(`<a href="${escapeAttr(demoLink.trim())}" target="_blank" rel="noopener noreferrer">Demo</a>`);
  }
  if (sourceLink.trim()) {
    links.push(`<a href="${escapeAttr(sourceLink.trim())}" target="_blank" rel="noopener noreferrer">Source</a>`);
  }
  const linksHtml = links.join('\n              <span>·</span>\n              ');

  const newEntry = `\n        <div class="project-item">
          <div class="project-header">
            <div class="project-name">${escapeHtml(name)}</div>
            <div class="project-links">
              ${linksHtml}
            </div>
          </div>
          <p class="project-desc">
            ${desc}
          </p>
          <div class="project-tags">
            ${tagsHtml}
          </div>
        </div>`;

  const projectsHtmlPath = path.join(__dirname, 'projects.html');
  if (fs.existsSync(projectsHtmlPath)) {
    let projectsHtml = fs.readFileSync(projectsHtmlPath, 'utf8');
    const containerTag = '<div class="project-list">';
    const index = projectsHtml.indexOf(containerTag);

    if (index !== -1) {
      const insertionPoint = index + containerTag.length;
      projectsHtml = projectsHtml.slice(0, insertionPoint) + newEntry + projectsHtml.slice(insertionPoint);
      fs.writeFileSync(projectsHtmlPath, projectsHtml, 'utf8');
      console.log('Updated: projects.html');
    } else {
      console.log('Warning: Could not find <div class="project-list"> in projects.html');
    }
  } else {
    console.log('Error: projects.html not found.');
  }
}

async function addRocketSpec() {
  console.log('\n--- Add Rocket Specifications ---');
  const name = await ask('Rocket Name: ');
  if (!name.trim()) return;

  const length = await ask('Length (e.g. 1.2 m): ');
  const diameter = await ask('Diameter (e.g. 54 mm): ');
  const recovery = await ask('Recovery (e.g. Single Deployment): ');
  const altitude = await ask('Max Altitude (e.g. 850 m / Under Build): ');

  const newRow = `\n          <tr>
            <td><strong>${escapeHtml(name)}</strong></td>
            <td class="mono">${escapeHtml(length)}</td>
            <td class="mono">${escapeHtml(diameter)}</td>
            <td>${escapeHtml(recovery)}</td>
            <td class="mono">${escapeHtml(altitude)}</td>
          </tr>`;

  const rocketsHtmlPath = path.join(__dirname, 'rockets.html');
  if (fs.existsSync(rocketsHtmlPath)) {
    let rocketsHtml = fs.readFileSync(rocketsHtmlPath, 'utf8');
    const tbodyTag = '<tbody>';
    const index = rocketsHtml.indexOf(tbodyTag);

    if (index !== -1) {
      const insertionPoint = index + tbodyTag.length;
      rocketsHtml = rocketsHtml.slice(0, insertionPoint) + newRow + rocketsHtml.slice(insertionPoint);
      fs.writeFileSync(rocketsHtmlPath, rocketsHtml, 'utf8');
      console.log('Updated: rockets.html specifications');
    } else {
      console.log('Warning: Could not find <tbody> in rockets.html');
    }
  } else {
    console.log('Error: rockets.html not found.');
  }
}

async function addRocketLog() {
  console.log('\n--- Add Launch Log Entry ---');
  const rocket = await ask('Rocket Name: ');
  if (!rocket.trim()) return;

  const today = new Date().toISOString().split('T')[0];
  const dateInput = await ask(`Launch Date (YYYY-MM-DD) [default: ${today}]: `);
  const date = dateInput.trim() || today;

  const motor = await ask('Motor Used (e.g. Aerotech H128W): ');
  const outcome = await ask('Flight Outcome Details (inline HTML allowed): ');

  const newLog = `\n        <li class="log-item">
          <span class="log-date">${escapeHtml(date)}</span>
          <div class="log-detail">
            <strong>${escapeHtml(rocket)}</strong> — ${escapeHtml(motor)}. ${outcome}
          </div>
        </li>`;

  const rocketsHtmlPath = path.join(__dirname, 'rockets.html');
  if (fs.existsSync(rocketsHtmlPath)) {
    let rocketsHtml = fs.readFileSync(rocketsHtmlPath, 'utf8');
    const logTag = '<ul class="log-list">';
    const index = rocketsHtml.indexOf(logTag);

    if (index !== -1) {
      const insertionPoint = index + logTag.length;
      rocketsHtml = rocketsHtml.slice(0, insertionPoint) + newLog + rocketsHtml.slice(insertionPoint);
      fs.writeFileSync(rocketsHtmlPath, rocketsHtml, 'utf8');
      console.log('Updated: rockets.html launch log');
    } else {
      console.log('Warning: Could not find <ul class="log-list"> in rockets.html');
    }
  } else {
    console.log('Error: rockets.html not found.');
  }
}

async function addPhotography() {
  console.log('\n--- Add Photography Entry ---');
  const filePath = await ask('Path to photo file (e.g., C:/Users/name/Downloads/pic.jpg): ');
  if (!filePath.trim()) return;

  // Make sure image file exists
  if (!fs.existsSync(filePath)) {
    console.log(`Error: File does not exist at path: ${filePath}`);
    return;
  }

  // Ensure images directory exists
  const imagesDir = path.join(__dirname, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
  }

  // Copy file to images/
  const destFileName = path.basename(filePath);
  const destFilePath = path.join(imagesDir, destFileName);
  try {
    fs.copyFileSync(filePath, destFilePath);
    console.log(`Copied photo to images/${destFileName}`);
  } catch (err) {
    console.log(`Error copying file: ${err.message}`);
    return;
  }

  const title = await ask('Photo Title: ');
  const captionDetails = await ask('Caption Details (e.g., Brothers, OR — 2026): ');
  const altText = await ask('Alt Text Description (for accessibility): ');

  // Cards are <button>s so the gallery is keyboard-accessible, and a <button> may
  // only contain phrasing content — hence <span>, not <div>, for the caption.
  const newCard = `\n        <button type="button" class="photo-card">
          <img src="images/${escapeAttr(encodeURI(destFileName))}" alt="${escapeAttr(altText || title)}" loading="lazy" />
          <span class="photo-caption">
            <span>${escapeHtml(title)}</span>
            <span>${escapeHtml(captionDetails)}</span>
          </span>
        </button>`;

  const photoHtmlPath = path.join(__dirname, 'photography.html');
  if (fs.existsSync(photoHtmlPath)) {
    let photoHtml = fs.readFileSync(photoHtmlPath, 'utf8');
    const gridTag = '<div class="photo-grid">';
    const index = photoHtml.indexOf(gridTag);

    if (index !== -1) {
      const insertionPoint = index + gridTag.length;
      photoHtml = photoHtml.slice(0, insertionPoint) + newCard + photoHtml.slice(insertionPoint);
      fs.writeFileSync(photoHtmlPath, photoHtml, 'utf8');
      console.log('Updated: photography.html');
      console.log('Tip: add width and height attributes to the new <img> for best results.');
    } else {
      console.log('Warning: Could not find <div class="photo-grid"> in photography.html');
    }
  } else {
    console.log('Error: photography.html not found.');
  }
}

async function main() {
  while (true) {
    console.log('\n====================================');
    console.log('   AIDAN YU WEBSITE CONTENT MANAGER ');
    console.log('====================================');
    console.log('1. Add Blog Post');
    console.log('2. Add Project');
    console.log('3. Add Rocket Spec');
    console.log('4. Add Rocket Launch Log');
    console.log('5. Add Photograph');
    console.log('6. Exit');

    const choice = await ask('\nChoose an option (1-6): ');

    switch (choice.trim()) {
      case '1':
        await addBlogPost();
        break;
      case '2':
        await addProject();
        break;
      case '3':
        await addRocketSpec();
        break;
      case '4':
        await addRocketLog();
        break;
      case '5':
        await addPhotography();
        break;
      case '6':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        console.log('Invalid option.');
    }
  }
}

main().catch(err => {
  console.error(`\nUnexpected error: ${err.message}`);
  rl.close();
  process.exitCode = 1;
});
