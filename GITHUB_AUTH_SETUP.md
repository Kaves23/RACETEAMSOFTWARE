# GitHub Authentication Setup

## Problem
Password authentication is no longer supported by GitHub. You need to use a Personal Access Token (PAT).

## Solution: Create a Personal Access Token

### Step 1: Create Token on GitHub

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Give it a name: `Race Team Software Deployment`
4. Select scopes:
   - ✅ `repo` (full control of private repositories)
   - ✅ `workflow` (if using GitHub Actions)
5. Click **"Generate token"**
6. **COPY THE TOKEN** (you won't see it again!)

### Step 2: Use Token as Password

When you push, Git will ask for credentials:
- **Username**: Your GitHub username
- **Password**: Paste your Personal Access Token (not your GitHub password!)

### Step 3: Save Credentials (Optional)

To avoid entering it every time:

```bash
# Tell git to remember your credentials
git config --global credential.helper store

# Now push (you'll be asked once)
git push origin feature/pitwall
```

After entering your token once, it will be saved.

---

## Alternative: Use SSH Instead

### Step 1: Generate SSH Key

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Press Enter to accept defaults.

### Step 2: Add SSH Key to GitHub

```bash
# Copy your public key
cat ~/.ssh/id_ed25519.pub
```

1. Go to: https://github.com/settings/keys
2. Click **"New SSH key"**
3. Paste your public key
4. Click **"Add SSH key"**

### Step 3: Update Remote URL

```bash
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"
git remote set-url origin git@github.com:Kaves23/RACETEAMSOFTWARE.git
git push origin feature/pitwall
```

---

## Quick Fix: Use GitHub Desktop (Easiest!)

1. Download GitHub Desktop: https://desktop.github.com
2. Sign in with your GitHub account
3. Add this repository
4. Push with one click!

---

## What You Need to Do NOW

1. **Create a Personal Access Token** (recommended - 2 minutes)
2. Then run:
   ```bash
   cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"
   git push origin feature/pitwall
   ```
3. When prompted for username/password:
   - Username: `Kaves23`
   - Password: `<paste your token>`

---

Let me know when you're ready to push!
