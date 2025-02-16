# SolStamp Backend

## This is the backend API and service layer for [solstamp.io](https://solstamp.io), an open-source No-Code SaaS to create tokens and NFTs on Solana.

## 🚀 Features

- RESTful API for minting Metaplex NFTs and SPL tokens on Solana
- Secure transaction management using partial backend signing
- Transparent minting costs
- Built with [NestJS](https://nestjs.com/) for scalability and maintainability

---

## 🛠️ Getting Started

### Prerequisites

- Node.js (v20)
- pnpm (or other package manager)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)

### Installation

1. **Clone the repository**
2. **Install dependencies**

   ```sh
   pnpm install
   ```

3. **Configure environment variables**

   - Copy `.env.example` to `.env` and update the values as needed for your Solana setup and secrets.

4. **Run locally**

   ```sh
   pnpm dev
   ```

---

## 📦 Project Structure

| Folder/File    | Description                       |
| -------------- | --------------------------------- |
| `/src`         | Main backend source code (NestJS) |
| `/test`        | Automated tests                   |
| `.env.example` | Example environment variables     |

---

## 📝 Contributing

Contributions are welcome!  
Feel free to open issues, suggest features, or submit pull requests.

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

## 💬 Contact

Questions, suggestions, or feedback?  
Open an issue or contact [hi@philipkrueck.com](mailto:hi@philipkrueck.com).

---
