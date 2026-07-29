# Setting Up the GitHub Repo

## Prerequisites

- Git installed on your machine
- GitHub account with the "Takeoff" repo created (empty repo recommended)
- Node.js and npm installed

## Steps

### 1. Navigate to your local project directory

```bash
cd /path/to/your/local/takeoff
```

If this is a new folder, create one:

```bash
mkdir takeoff
cd takeoff
```

### 2. Copy all files into the directory

Make sure you have these files in the directory:
- `FoundationTakeoff.jsx` (the main component)
- `main.jsx` (React entry point)
- `index.html` (HTML shell)
- `package.json` (dependencies)
- `vite.config.js` (Vite config)
- `README.md` (project description)
- `.gitignore` (git ignore rules)

### 3. Initialize git (if not already done)

```bash
git init
git add .
git commit -m "Initial commit: Takeoff foundation estimator"
```

### 4. Add your GitHub remote

Replace `YOUR_USERNAME` with your GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/Takeoff.git
```

Or if using SSH (recommended for easier authentication):

```bash
git remote add origin git@github.com:YOUR_USERNAME/Takeoff.git
```

### 5. Push to GitHub

```bash
git branch -M main
git push -u origin main
```

### 6. Install dependencies locally (for development)

```bash
npm install
```

### 7. Run the dev server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

### 8. Build for production

```bash
npm run build
```

Output goes to the `dist/` folder.

## Future Updates

After making changes locally:

```bash
git add .
git commit -m "Describe your changes"
git push
```

## Troubleshooting

**"fatal: not a git repository"**
- Run `git init` in your project directory

**"Permission denied (publickey)"**
- You're using SSH but haven't set up GitHub SSH keys. Either:
  - Set up SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
  - Or switch to HTTPS: `git remote set-url origin https://github.com/YOUR_USERNAME/Takeoff.git`

**Module not found errors after npm install**
- Make sure `package.json` is correct and run `npm install` again
- Delete `node_modules/` and `package-lock.json`, then `npm install` fresh

**Vite build errors**
- Ensure Three.js is installed: `npm install three`
- Check that `FoundationTakeoff.jsx` is in the src directory (or update import paths in `main.jsx`)
