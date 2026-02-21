This technical specification is designed to be fed into an LLM (like myself, Claude, or GPT-4) to generate the boilerplate and core logic for your application. It follows a **modular implementation strategy** to ensure the code remains maintainable and bug-free.

# ---

**Technical Specification: "ManipulaDB" (Working Title)**

**Stack:** Tauri v2, Rust, React, TypeScript, Tailwind CSS, SQLx.

## **1\. Project Initialization & Structure**

**Instruction for LLM:** "Initialize a Tauri v2 project named manipula-db. Use pnpm for the frontend. Set up a React \+ TypeScript frontend with Vite. Organize the Rust backend into a modular structure: src-tauri/src/db/, src-tauri/src/commands/, and src-tauri/src/models/."

**Desired Folder Structure:**

Plaintext

manipula-db/
├── src/                \# React Frontend  
│   ├── components/     \# UI Components (DataTable, Sidebar, Editor)  
│   ├── hooks/          \# Custom hooks (useQuery, useConnection)  
│   ├── store/          \# State management (Zustand)  
│   └── lib/            \# Utils (Tauri invoke wrappers)  
├── src-tauri/          \# Rust Backend  
│   ├── src/  
│   │   ├── db/         \# SQLx connection logic & pooling  
│   │   ├── commands/   \# Tauri Command handlers  
│   │   ├── models/     \# Serde Structs for DB results  
│   │   └── main.rs     \# App entry & State management  
└── ...config files

## ---

**2\. Backend Architecture (Rust)**

**Instruction for LLM:**

"Implement a thread-safe connection manager in Rust using tauri::State. Use an enum to handle different database drivers (Postgres, MySQL, SQLite) via sqlx. Ensure the connection pool is wrapped in an Arc\<Mutex\<\>\> or a DashMap for concurrent access across multiple tabs."

### **Core Components to Implement:**

* **Connection Struct:**  
  Rust  
  \#\[derive(Serialize, Deserialize)\]  
  pub struct DbConnectionConfig {  
      pub id: String,  
      pub driver: String, // "postgres" | "mysql" | "sqlite"  
      pub url: String,  
  }

* **Generic Query Result:**  
  Rust  
  \#\[derive(Serialize)\]  
  pub struct QueryResult {  
      pub columns: Vec\<String\>,  
      pub rows: Vec\<serde\_json::Value\>, // Dynamic JSON for UI Grid  
      pub execution\_time\_ms: u64,  
  }

## ---

**3\. Frontend Architecture (React)**

**Instruction for LLM:**

"Set up a layout using Tailwind CSS: A collapsible sidebar for 'Connections' and a main area using a Tab system for 'Query Editors'. Integrate monaco-editor for SQL input and @tanstack/react-table for a virtualized data grid."

### **Component Requirements:**

* **Sidebar:** Fetches saved connections from local storage or backend config.  
* **Query Tab:** Contains a Monaco instance and a Result Pane.  
* **Data Table:** Must support 'Virtual Scrolling' to handle 10k+ rows without lag.

## ---

**4\. Feature Implementation Roadmap (Prompt Sequence)**

You should feed these prompts to the LLM one by one to build the app incrementally:

### **Step 1: The Connection Command**

"Write a Tauri command test\_connection and connect\_db. It should take a DbConnectionConfig struct, attempt to connect using sqlx, and store the active pool in the Tauri state. Return a Success or Error message to the frontend."

### **Step 2: Dynamic Query Execution**

"Write a Tauri command execute\_query. It should retrieve the active DB pool from state, execute a raw SQL string provided by the frontend, and map the database rows into a QueryResult struct where each row is a JSON object. Handle SQL errors gracefully."

### **Step 3: Frontend Data Grid**

"Create a React component using @tanstack/react-table that accepts the QueryResult object. Implement a 'virtualized' body so it can render thousands of rows efficiently. Add a search filter for the columns."

### **Step 4: SQL Editor Integration**

"Integrate @monaco-editor/react. Set the language to 'sql'. Create a custom hook that allows the user to press Ctrl+Enter to trigger the execute\_query command and update the Data Grid state."

## ---

**5\. Security & Performance Constraints**

* **Sensitive Data:** Never store passwords in plain text in the frontend. If using a local config file, instruct the LLM to use the keyring crate in Rust to store credentials in the System Vault (Keychain/Windows Credential Manager).  
* **Memory Management:** Ensure the Rust backend limits the maximum number of rows returned to the frontend (e.g., hard cap at 50,000) to prevent IPC (Inter-Process Communication) bottlenecks.

### ---

**Would you like me to generate the first piece of code now?**

For example, the **Rust main.rs and the Connection Manager logic**?