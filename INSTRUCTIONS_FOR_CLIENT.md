# Sierra Myco Lab - Next.js Landing Page

This is the **new premium landing page** built with Next.js. It replaces your old static HTML landing page with a modern React-based version that has smooth animations and your Supabase auth already integrated.

---

## 🚀 MIGRATION GUIDE: Static HTML → Next.js

You're switching from a static HTML site to Next.js. Here's everything you need to do:

---

## Step 1: Install Node.js

Download and install Node.js (LTS version) from:
**https://nodejs.org/**

Verify installation:
```bash
node --version   # Should show v18.x or higher
npm --version    # Should show 9.x or higher
```

---

## Step 2: Install Dependencies

Open terminal in this folder and run:
```bash
npm install
```

This installs all required packages:
- Next.js 14 (React framework)
- Tailwind CSS (styling)
- Framer Motion (animations)
- GSAP (scroll animations)
- Supabase JS (auth & database)
- Lucide React (icons)

---

## Step 3: Run Development Server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Step 4: Test Authentication

1. Click "Sign In" or "Get Started"
2. The auth modal opens
3. Sign in with an existing account or create new one
4. After login → redirects to your main app

**Your Supabase credentials are already configured:**
- URL: `https://wsalxxsjnxptoeduwfqw.supabase.co`
- Anon Key: Already in `src/components/AuthModal.tsx`

---

## Step 5: Deploy to Vercel (Recommended)

Vercel is the easiest way to deploy Next.js:

### Option A: Via CLI
```bash
npm i -g vercel
vercel
```

### Option B: Via GitHub
1. Push this folder to a GitHub repo
2. Go to https://vercel.com
3. Click "Import Project"
4. Select your repo
5. Click "Deploy"

Vercel will automatically detect Next.js and configure everything.

---

## Step 6: Update Your Domain

After deploying to Vercel:
1. Go to your Vercel dashboard
2. Click on your project
3. Go to Settings → Domains
4. Add your custom domain (e.g., sierramycolab.com)
5. Update DNS records as instructed

---

## ✅ What's Already Done

- [x] Full premium landing page with all animations
- [x] Mushroom background animation (canvas-based)
- [x] Hero section with gradient text
- [x] Features grid with hover effects
- [x] App Showcase screens (Dashboard, Inoculation, Inventory, etc.)
- [x] Pricing cards (Free & Pro tiers)
- [x] Roadmap CTA section
- [x] **Auth Modal** - Sign In / Sign Up with Supabase
- [x] All buttons connected to auth modal
- [x] Mobile responsive design
- [x] Smooth scroll animations (GSAP)
- [x] Page transitions (Framer Motion)

---

## 🔧 What You May Want to Customize

### Change Redirect After Login

Edit `src/components/AuthModal.tsx` line ~62:
```typescript
// Change this URL to wherever you want users to go after login
window.location.href = "https://sierramycolab.com";
```

### Add Feedback Modal for Roadmap

Ask your AI assistant:
> "Create a FeedbackModal component that opens when clicking the Roadmap button. It should fetch and display items from my `feedback` table in Supabase, and allow users to submit new feature requests."

### Add Password Reset Page

Ask your AI assistant:
> "Create a /reset-password page that handles Supabase password reset tokens."

### Update Supabase Credentials

If you need to change credentials, edit `src/components/AuthModal.tsx`:
```typescript
const SUPABASE_URL = "your-new-url";
const SUPABASE_ANON_KEY = "your-new-key";
```

---

## 📁 File Structure

```
MycoTrack-NextJS/
├── public/
│   └── images/
│       └── growth/          # Mushroom animation frames
│           ├── growth-1.png
│           ├── growth-2.png
│           ├── growth-3.png
│           ├── growth-4.png
│           ├── growth-5.png
│           └── growth-6.png
├── src/
│   ├── app/
│   │   ├── layout.tsx      # Main layout with fonts
│   │   ├── page.tsx        # Home page
│   │   └── globals.css     # Global styles
│   └── components/
│       ├── AuthModal.tsx   # ✅ Sign In/Up modal (Supabase)
│       ├── Hero.tsx        # Hero section
│       ├── Features.tsx    # Features grid
│       ├── AppShowcase.tsx # App preview screens
│       ├── Pricing.tsx     # Pricing cards
│       ├── Roadmap.tsx     # Roadmap CTA
│       ├── SiteNav.tsx     # Navigation bar
│       ├── SiteFooter.tsx  # Footer
│       ├── MushroomBackground.tsx  # Animated background
│       ├── DashboardPreview.tsx    # Dashboard mockup
│       ├── SectionReveal.tsx       # Scroll animations
│       └── SmoothScroll.tsx        # Smooth scrolling
├── package.json            # Dependencies
├── tailwind.config.js      # Tailwind configuration
├── next.config.js          # Next.js configuration
└── INSTRUCTIONS_FOR_CLIENT.md  # This file
```

---

## 🔄 Git Setup

To push to your repository:

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Migrate to Next.js landing page"

# Add your remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push
git push -u origin main
```

---

## 📝 Key Differences from Static HTML

| Old (Static HTML) | New (Next.js) |
|-------------------|---------------|
| Plain HTML files | React components |
| CSS files | Tailwind CSS |
| Vanilla JS | React + TypeScript |
| No build step | `npm run build` |
| Any hosting | Vercel/Netlify/Node.js |
| Manual updates | Component-based |

---

## 🆘 Troubleshooting

### "npm command not found"
→ Install Node.js from https://nodejs.org/

### "Module not found" errors
→ Run `npm install` again

### Auth not working
→ Check Supabase credentials in `src/components/AuthModal.tsx`

### Styles look wrong
→ Run `npm run dev` (not just opening HTML file)

### Build fails
→ Run `npm run build` to see specific errors

---

## 📞 Need Help?

If you need to make changes, give your AI assistant this context:

> "This is a Next.js 14 app with Tailwind CSS, Framer Motion, and GSAP. It uses Supabase for authentication. The main page is in `src/app/page.tsx` and components are in `src/components/`. The auth modal is already working with Supabase credentials embedded in `src/components/AuthModal.tsx`."

---

## 🎉 You're Done!

Once deployed, your new landing page will have:
- Beautiful animations
- Fast performance
- Working auth (Sign In / Sign Up)
- Mobile responsive design
- Easy to update via React components
