# <p align="center"><img src="public/logo.png" alt="Vaanix Logo" width="120" height="120"></p>
# <p align="center">VAANIX</p>
<p align="center">
  <strong>Voice AI Agents, Simplified.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vite-8A2BE2?style=for-the-badge&logo=vite&logoColor=FFD700" alt="Vite">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
  <img src="https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white" alt="Twilio">
</p>

<p align="center">
  A premium, high-fidelity conversational platform that orchestrates real-time, full-duplex voice interactions. Vaanix connects telephone networks (Twilio) directly with leading AI models (Claude, Deepgram, ElevenLabs) with sub-second latency.
</p>

---

## 🎬 Cinematic Demo & Hero
Vaanix is crafted with premium visual aesthetics, featuring an animated brand mark, dark-mode glassmorphic layouts, and responsive panels designed to feel alive, modern, and technical.

---

## ✨ Key Features

- **⚡ Sub-Second Speech Latency**: Custom WebSocket audio streaming handles voice capture and synthesis, keeping conversation response lags under 700ms.
- **🎙️ ElevenLabs Generative Voices**: Integrate realistic text-to-speech engine profiles, with custom cloning and fine-tuning control.
- **🧠 Full Duplex Agent Flow**: Powered by Deepgram STT, Claude LLM prompt trees, and ElevenLabs TTS to support natural interruptions and conversational context.
- **📊 Developer Console**: Stat-dense workspace displaying active assistants, total calls, minutes consumed, average latency, and real-time active/inactive status.
- **📞 Twilio Telephony Webhooks**: Easily provision virtual phone numbers, manage Twilio Media Streams, and configure outbound dialing webhooks.
- **📁 COLLAPSIBLE LAYOUTS**: Responsive sidebar console collapsing to icon-only on desktops, and transitioning into a touch drawer on mobile screens.

---

## 🏗️ System Architecture

The diagram below outlines how Vaanix routes media streams in real-time between the telephone provider, the server, and the AI engines:

```mermaid
sequenceDiagram
    autonumber
    actor User as Telephone User
    participant Twilio as Twilio Media Stream
    participant Server as Vaanix Server (WebSockets)
    participant Deepgram as Deepgram (STT)
    participant LLM as Claude 3.5 (LLM Core)
    participant ElevenLabs as ElevenLabs (TTS)

    User->>Twilio: Speaks into phone
    Twilio->>Server: Streams raw mulaw audio (WebSocket)
    Server->>Deepgram: Forwards raw audio stream
    Deepgram->>Server: Returns transcribed text
    Server->>LLM: Dispatches prompt & history context
    LLM->>Server: Streams generated text response
    Server->>ElevenLabs: Sends text chunks for TTS synthesis
    ElevenLabs->>Server: Streams back synthesized audio (PCM/mulaw)
    Server->>Twilio: Sends audio payload (WebSocket)
    Twilio->>User: Audio played to handset (Sub-700ms)
```

---

## 📂 Repository Structure

```directory
├── .agents/                    # Custom GSD and design guidelines
├── public/                     # Static assets (logo, visual aids)
├── src/
│   ├── components/             # Reusable UI component modules (cards, modals, widgets)
│   ├── integrations/           # Supabase client declarations
│   ├── routes/                 # TanStack filesystem-based routes
│   │   ├── _authenticated/     # Protected console views (assistants, call logs, phone numbers)
│   │   ├── auth.tsx            # Login and onboarding screen
│   │   └── index.tsx           # Premium animated landing page
│   ├── server/                 # Express backend streaming server
│   │   ├── routes/             # Endpoints for outbound calls, voice tokens, and TTS previews
│   │   ├── services/           # Tool execution, system prompt builders, and API configurations
│   │   └── index.ts            # Server entry point, hosting WS connection handlers
│   └── styles.css              # Custom design system styles and animation tokens
├── supabase/                   # Supabase configuration, schema structures, and migrations
├── package.json                # Project dependencies and deployment scripts
└── vite.config.ts              # Vite compiler configuration
```

---

## 🚀 Quick Start

### 📋 Prerequisites
Ensure you have the following installed on your local environment:
- Node.js (v18+)
- npm (v9+)
- Twilio Account (with provisioned phone numbers)
- Supabase project
- ElevenLabs API Account
- Deepgram API Account
- Anthropic API key (for Claude)

---

### ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Atharv1136/campusconnect-ai-assistant.git
   cd campusconnect-ai-assistant
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following keys. **Do not commit this file to Git.**
   ```env
   # Telephony (Twilio)
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_NUMBER=your_twilio_phone_number

   # Database (Supabase)
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # AI Providers
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key

   # Public Server Domain (Tunnel address)
   SERVER_DOMAIN=your_tunnel_address.serveo.net
   ```

---

### 💻 Running Locally

To run the application locally with database connections and WebSocket tunneling:

1. **Launch the backend services**:
   ```bash
   npm run server:run
   ```

2. **Launch the frontend development server**:
   ```bash
   npm run dev
   ```

3. **Expose the local server to Twilio (SSH Tunneling)**:
   Twilio requires a public HTTPS URL to stream calls to your local system. Run the tunnel tool:
   ```bash
   node tunnel.js
   ```
   *Note: This binds your local port `3000` to a public URL (e.g., `https://vaanix.serveo.net`) and auto-registers it with your Twilio webhook settings.*

---

## 🔐 Security & Secrets

> [!WARNING]
> **Never commit your API keys or `.env` files to git.**
> The `.gitignore` has been updated to explicitly ignore all `.env` files. If you add new environment-specific configurations, verify that they are covered under ignored patterns by running `git status`.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
