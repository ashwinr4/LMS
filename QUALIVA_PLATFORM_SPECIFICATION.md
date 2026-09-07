# Qualiva Enterprise Platform Specification
### Architectural Blueprint: Mandatory 2FA OTP Authentication, Multi-Modal Course Creator Studio & Anti-Skip Sequential Engine

---

## 1. Executive Summary

This document specifies the technical and functional enhancements for the **Qualiva Enterprise Learning & Governance Platform**:
1. **Mandatory 2FA OTP Security & Automated Welcome Emails** for all email/password logins and Google SSO registrations.
2. **Course Creator Studio Overhaul** with unified "Course" terminology and a clean, dropdown-based multi-modal lecture builder supporting **Videos**, **PDFs**, **Word/Reading Documents**, and **Images/Diagrams**, featuring **automatic video duration detection**.
3. **Student Learning Player with Strict Sequential Unlocking & Forward-Seek Anti-Skip Controls**, equipped with a real-time progress bar.

---

## 2. Authentication & Security Architecture

```
[ User Inputs Email & Password ]
               │
               ▼
   [ Backend Verifies Credentials ] ──(Invalid)──► [ Error Alert ]
               │
           (Valid)
               ▼
[ Generate Cryptographic 6-Digit OTP ]
               │
               ▼
[ Dispatch OTP via Live Gmail SMTP ] ──► [ User Receives Email Code ]
               │
               ▼
[ UI Transitions to 6-Digit Passcode Screen ]
               │
               ▼
      [ User Enters Code ]
               │
        (Valid & Active)
               ▼
  ┌─────────────────────────────┐
  │ Is this First-Time Login?   │
  └──────────────┬──────────────┘
          Yes    │    No
    ┌────────────┴────────────┐
    ▼                         ▼
[ Send Welcome Email ]   [ Skip Welcome Email ]
    └────────────┬────────────┘
                 ▼
[ Issue JWT Access Token & HttpOnly Cookie ]
                 │
                 ▼
[ Auto-Redirect to Role Dashboard (Admin / Creator / Student) ]
```

### 2.1 Login & 2FA OTP Protocol
- **Every Login**: When any user enters their credentials at `/login`, the server verifies the password and immediately generates a 6-digit numeric OTP.
- **Dispatch**: The OTP is dispatched in real time to the user’s registered email address using the authenticated Gmail SMTP service.
- **Verification Screen**: The frontend displays a dedicated, clean 6-digit passcode input dialog with auto-focus and a 10-minute expiry timer.
- **Dashboard Grant**: The user is only issued their active session token (`accessToken` + HttpOnly refresh cookie) upon successful OTP verification.

### 2.2 First-Time Login Welcome Email
- On the very first successful OTP verification after account creation, the system flags `isFirstLogin = false` and automatically dispatches a branded **"Welcome to Qualiva Enterprise"** email.
- Subsequent logins proceed with normal OTP verification without repeating the welcome message.

### 2.3 Google SSO Authentication Rule
- **New Registration via Google**: User authenticates with Google and receives a one-time OTP verification to confirm mailbox access.
- **Subsequent Sign-Ins via Google**: Seamless single-click authentication into the dashboard.

---

## 3. Course Creator Studio Overhaul

### 3.1 Terminology & Hierarchy
- The system replaces all legacy *"Module"* terminology with **"Course"** across the entire UI.
- **Course Hierarchy**:
  $$\text{Course} \longrightarrow \text{Sections} \longrightarrow \text{Lectures}$$

### 3.2 Dropdown-Based Multi-Modal Lecture Creation Modal
A clean, compact modal with a single **"Content Type"** dropdown menu (**Video Lecture** selected by default):

```
┌────────────────────────────────────────────────────────────────────────┐
│  Add New Lecture to Section                                        [✕] │
├────────────────────────────────────────────────────────────────────────┤
│  Lecture Title *                                                       │
│  [ e.g. Lecture 1.2: System Architecture Deep Dive                   ] │
│                                                                        │
│  Content Type                                                          │
│  [ 🎬 Video Lecture (Default)                                        ▼ ] │
│    ├── 🎬 Video Lecture (Default)                                      │
│    ├── 📄 PDF Document                                                 │
│    ├── 📝 Word / Reading Document                                      │
│    └── 🖼️ Image / Diagram                                              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  📁 Upload Video File or Enter Video URL                         │  │
│  │  [ Drag & drop MP4 / WebM video file here or browse computer ]   │  │
│  │  ── or ──                                                        │  │
│  │  [ Video Stream URL: https://...                               ] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ✓ Real Video Length: 14 mins 28 secs (Automatically Detected)        │
│                                                                        │
│  [ Cancel ]                                            [ Save Lecture ]│
└────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Dynamic Multi-Modal Field Adaptation

| Selected Type in Dropdown | Creator Upload Options | Live Behavior |
| :--- | :--- | :--- |
| **🎬 Video Lecture (Default)** | • Direct Video File Upload (`.mp4`, `.webm`, `.mov`)<br>• Direct Media / CDN / Stream URL | **Zero manual durations**. Browser/system extracts exact video duration automatically upon selection and tags it to the lecture. |
| **📄 PDF Document** | • PDF File Upload (`.pdf`)<br>• Document URL | Renders an embedded in-browser PDF reader with zoom, page navigation, and download permission toggle. |
| **📝 Word / Reading Document** | • Rich Markdown / Text Content Editor | Formatted text canvas with code highlighting, bullet points, and headers for reading lectures. |
| **🖼️ Image / Diagram** | • High-Resolution Image Upload (`.png`, `.jpg`, `.svg`, `.webp`) | High-definition zoomable image viewer with inspection tools. |

---

## 4. Student Learning Player Engine

### 4.1 Real-Time Lecture Progression Bar
- **Lecture-Level Bar**: Positioned directly beneath the active video/document:
  $$\text{Lecture Progress: } 45\% \quad (06:30 \text{ / } 14:28)$$
  Fills smoothly in real time as the video plays or reading content progresses.
- **Course-Level Bar**: Positioned in the player header:
  $$\text{Course Completion: } 3 \text{ of } 8 \text{ Lectures Completed} \quad (37.5\%)$$
  Updates immediately upon lecture completion.

### 4.2 Forward-Seek Anti-Skip Protection (Anti-Cheat)
1. **Maximum Watched Threshold**: The player tracks the maximum legitimate second reached (`maxWatchedTime`).
2. **Forward Seeking Blocked**: If a student attempts to drag the progress bar forward past `maxWatchedTime`, the player immediately reverts playback to `maxWatchedTime` and notifies the student: *"Please watch the lecture to advance."*
3. **Rewind Allowed**: Students can freely rewind to review earlier parts of the lecture.

### 4.3 Sequential Unlocking Mechanism
- **Active Lecture (▶️)**: Unlocked and playable.
- **Completed Lectures (✅)**: Marked with a green checkmark; accessible anytime for review.
- **Locked Lectures (🔒)**: Subsequent lectures remain strictly locked until the active lecture reaches 100% completion.
- **Automated Next-Lecture Transition**: When a lecture completes, the next sequential lecture in the curriculum unlocks with a toast notification and auto-advances.

---

## 5. Architectural Comparison Matrix

| Feature | Current State | Proposed Upgraded State |
| :--- | :--- | :--- |
| **Login Security** | Direct email/password sign-in | **Mandatory 6-digit OTP verification** sent to registered email on every login |
| **First-Time Login** | Standard redirect | **Automated Welcome Email** dispatched on initial OTP verification |
| **Creator Terminology** | "Modules" | **"Courses"** throughout all portals |
| **Lecture Content Types** | Basic placeholder | **Video (Default), PDF, Word/Document, Image** selectable via clean dropdown |
| **Video Duration** | Hardcoded / Manual input | **100% Automatic Detection** from uploaded media metadata |
| **Student Player Anti-Skip** | Free seeking enabled | **Strict forward-seek prevention** past watched threshold |
| **Sequential Unlocking** | Open access | **Locked (🔒) until previous lecture reaches 100% completion** |
| **Progression Bar** | Generic indicator | **Real-time dual progress bars** (Live Lecture Time + Course Percentage) |

---

*Authored for Qualiva Enterprise Platform Engineering.*
