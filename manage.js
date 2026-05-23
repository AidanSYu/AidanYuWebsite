const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function formatDateLong(dateStr) {
  // Parses YYYY-MM-DD and returns "Month DD, YYYY"
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const year = parts[0];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return `${month} ${day}, ${year}`;
}

async function addBlogPost() {
  console.log('\n--- Add Blog Post ---');
  const title = await ask('Post Title: ');
  if (!title.trim()) {
    console.log('Title cannot be empty.');
    return;
  }

  // Create slug
  let defaultSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slugInput = await ask(`URL Slug [default: ${defaultSlug}]: `);
  const slug = slugInput.trim() || defaultSlug;

  // Date
  const today = new Date().toISOString().split('T')[0];
  const dateInput = await ask(`Publish Date (YYYY-MM-DD) [default: ${today}]: `);
  const date = dateInput.trim() || today;

  console.log('\nEnter your post body. Press Enter, then type DONE on a new line and press Enter to finish:');
  const paragraphs = [];
  let currentPara = '';
  
  while (true) {
    const line = await ask('> ');
    if (line.trim() === 'DONE') {
      if (currentPara.trim()) paragraphs.push(currentPara.trim());
      break;
    }
    
    if (line.trim() === '') {
      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
        currentPara = '';
      }
    } else {
      currentPara += (currentPara ? ' ' : '') + line.trim();
    }
  }

  if (paragraphs.length === 0) {
    console.log('Post cannot be empty.');
    return;
  }

  // Create blog subdirectory if it doesn't exist
  const blogDir = path.join(__dirname, 'blog');
  if (!fs.existsSync(blogDir)) {
    fs.mkdirSync(blogDir);
  }

  // Standalone post page HTML
  const postHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Aidan Yu</title>
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="../index.html">aidan yu</a>
      <nav aria-label="Primary">
        <ul class="nav">
          <li><a href="../index.html">home</a></li>
          <li><a href="../blog.html" aria-current="page">blog</a></li>
          <li><a href="../projects.html">projects</a></li>
          <li><a href="../rockets.html">rockets</a></li>
          <li><a href="../photography.html">photography</a></li>
        </ul>
      </nav>
    </header>

    <main>
      <a class="back-link" href="../blog.html">← back to blog</a>
      <h1 class="page-title">${title.toLowerCase()}</h1>
      <div class="post-meta">Published: ${formatDateLong(date)}</div>

      <article>
        ${paragraphs.map(p => `<p>${p}</p>`).join('\n        ')}
      </article>
    </main>
  </body>
</html>
`;

  const postFilePath = path.join(blogDir, `${slug}.html`);
  fs.writeFileSync(postFilePath, postHtml, 'utf8');
  console.log(`Created: blog/${slug}.html`);

  // Update blog.html
  const blogHtmlPath = path.join(__dirname, 'blog.html');
  if (fs.existsSync(blogHtmlPath)) {
    let blogHtml = fs.readFileSync(blogHtmlPath, 'utf8');
    const listTag = '<ul class="blog-list">';
    const listIndex = blogHtml.indexOf(listTag);
    
    if (listIndex !== -1) {
      const insertionPoint = listIndex + listTag.length;
      const newEntry = `\n        <li class="blog-item">
          <span class="blog-date">${date}</span>
          <a class="blog-link" href="blog/${slug}.html">${title}</a>
        </li>`;
      
      blogHtml = blogHtml.slice(0, insertionPoint) + newEntry + blogHtml.slice(insertionPoint);
      fs.writeFileSync(blogHtmlPath, blogHtml, 'utf8');
      console.log('Updated: blog.html list');
    } else {
      console.log('Warning: Could not find <ul class="blog-list"> in blog.html. Please add the link manually.');
    }
  } else {
    console.log('Error: blog.html not found.');
  }
}

async function addProject() {
  console.log('\n--- Add Project ---');
  const name = await ask('Project Name: ');
  if (!name.trim()) return;

  const desc = await ask('Description: ');
  const tagsInput = await ask('Tags (comma-separated, e.g. C++, Web, ESP32): ');
  const demoLink = await ask('Demo Link (optional): ');
  const sourceLink = await ask('Source Code Link (optional): ');

  const tags = tagsInput.split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const tagsHtml = tags.map(t => `<span class="project-tag">${t}</span>`).join('\n            ');
  
  const links = [];
  if (demoLink.trim()) {
    links.push(`<a href="${demoLink.trim()}" target="_blank" rel="noopener noreferrer">Demo</a>`);
  }
  if (sourceLink.trim()) {
    links.push(`<a href="${sourceLink.trim()}" target="_blank" rel="noopener noreferrer">Source</a>`);
  }
  const linksHtml = links.join('\n              <span>·</span>\n              ');

  const newEntry = `\n        <div class="project-item">
          <div class="project-header">
            <div class="project-name">${name}</div>
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
            <td><strong>${name}</strong></td>
            <td class="mono">${length}</td>
            <td class="mono">${diameter}</td>
            <td>${recovery}</td>
            <td class="mono">${altitude}</td>
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
  const outcome = await ask('Flight Outcome Details: ');

  const newLog = `\n        <li class="log-item">
          <span class="log-date">${date}</span>
          <div class="log-detail">
            <strong>${rocket}</strong> — ${motor}. ${outcome}
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

  const newCard = `\n        <div class="photo-card">
          <img src="images/${destFileName}" alt="${altText || title}" loading="lazy" />
          <div class="photo-caption">
            <span>${title}</span>
            <span>${captionDetails}</span>
          </div>
        </div>`;

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
    } else {
      console.log('Warning: Could not find <div class="photo-grid"> in photography.html');
    }
  } else {
    console.log('Error: photography.html not found.');
  }
}

async function main() {
  console.log('====================================');
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
  
  // Re-run loop
  main();
}

main();
