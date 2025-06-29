// @ts-nocheck
'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Removed direct imports for xlsx, papaparse, @tanstack/react-table as they will be loaded via CDN.
// These modules are now expected to be globally available as XLSX and Papa.
import { ArrowUpTrayIcon, DocumentArrowDownIcon, CpuChipIcon, ExclamationTriangleIcon, LightBulbIcon, WrenchScrewdriverIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'; // Using Heroicons for a clean look
import * as XLSX from 'xlsx';

// Define the expected data structures for validation and AI context
const CLIENT_HEADERS = ['ClientID', 'ClientName', 'PriorityLevel', 'RequestedTaskIDs', 'GroupTag', 'AttributesJSON'];
const WORKER_HEADERS = ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase', 'WorkerGroup', 'QualificationLevel'];
const TASK_HEADERS = ['TaskID', 'TaskName', 'Category', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent'];

// TypeScript interfaces for data structures
interface Client {
  ClientID: string;
  ClientName: string;
  PriorityLevel: number;
  RequestedTaskIDs: string[];
  GroupTag?: string;
  AttributesJSON?: Record<string, any>;
}

interface Worker {
  WorkerID: string;
  WorkerName: string;
  Skills: string[];
  AvailableSlots: number[];
  MaxLoadPerPhase: number;
  WorkerGroup?: string;
  QualificationLevel?: string;
}

interface Task {
  TaskID: string;
  TaskName: string;
  Category?: string;
  Duration: number;
  RequiredSkills: string[];
  PreferredPhases: number[];
  MaxConcurrent: number;
}

// Validation error and summary types
interface ValidationError {
  rowIdx: number;
  colId: string;
  message: string;
}

interface ValidationSummary {
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
}

// Utility function to generate a unique ID for a record if needed (e.g., for new rows)
const generateUniqueId = (): string => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper to parse comma-separated strings into arrays, trimming whitespace
const parseCommaSeparated = (str: string): string[] => {
  if (typeof str !== 'string' || str.trim() === '') return [];
  return str.split(',').map(s => s.trim()).filter(s => s !== '');
};

// Helper to parse PreferredPhases string (e.g., "1-3" or "[2,4,5]") into an array of numbers
const parsePreferredPhases = (str: string): number[] => {
  if (typeof str !== 'string' || str.trim() === '') return [];
  str = str.trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const arr = JSON.parse(str);
      return Array.isArray(arr) ? arr.map(Number).filter(n => !isNaN(n)) : [];
    } catch (e) {
      console.warn("Malformed JSON array in PreferredPhases:", str, e);
      return []; // Malformed JSON array
    }
  } else if (str.includes('-')) {
    const parts = str.split('-').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] <= parts[1]) {
      return Array.from({ length: parts[1] - parts[0] + 1 }, (_, i) => parts[0] + i);
    }
  }
  // Assume it's a single number if not range or array
  const num = Number(str);
  return isNaN(num) ? [] : [num];
};

function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'clients' | 'workers' | 'tasks'>('clients');
  const [validationErrors, setValidationErrors] = useState<{
    clients: ValidationError[];
    workers: ValidationError[];
    tasks: ValidationError[];
  }>({ clients: [], workers: [], tasks: [] });
  const [validationSummary, setValidationSummary] = useState<ValidationSummary[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [nlQuery, setNlQuery] = useState('');
  const [filteredData, setFilteredData] = useState<{
    clients?: Client[];
    workers?: Worker[];
    tasks?: Task[];
  }>({});
  const [showFilterResults, setShowFilterResults] = useState(false);

  // Firebase setup and authentication
  const db = useRef<any>(null);
  const auth = useRef<any>(null);

  useEffect(() => {
    // Dynamically load external libraries (XLSX, PapaParse)
    const loadScript = (src: string, id: string, onloadCallback?: () => void) => {
      if (document.getElementById(id)) {
        if (onloadCallback) onloadCallback();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.id = id;
      script.onload = onloadCallback || null;
      script.onerror = () => console.error(`Failed to load script: ${src}`);
      document.body.appendChild(script);
    };

    let papaparseLoaded = false;
    let xlsxLoaded = false;

    const checkAllLoaded = () => {
      if (papaparseLoaded && xlsxLoaded) {
        console.log("All external data parsing libraries loaded.");
      }
    };

    loadScript('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js', 'papaparse-script', () => {
      papaparseLoaded = true;
      checkAllLoaded();
    });
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'xlsx-script', () => {
      xlsxLoaded = true;
      checkAllLoaded();
    });

    // Firebase initialization
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    const initializeFirebase = async () => {
      if (firebaseConfig) {
        try {
          const { initializeApp } = await import('firebase/app');
          const { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = await import('firebase/auth');
          const { getFirestore } = await import('firebase/firestore');

          const app = initializeApp(firebaseConfig);
          db.current = getFirestore(app);
          auth.current = getAuth(app);

          onAuthStateChanged(auth.current, async (user) => {
            if (user) {
              setUserId(user.uid);
              setIsAuthReady(true);
            } else {
              // Sign in anonymously if no token is provided or user is not logged in
              if (initialAuthToken) {
                try {
                  await signInWithCustomToken(auth.current, initialAuthToken);
                  setUserId(auth.current.currentUser.uid);
                } catch (error) {
                  console.error("Error signing in with custom token:", error);
                  // Fallback to anonymous if custom token fails
                  await signInAnonymously(auth.current);
                  setUserId(auth.current.currentUser.uid);
                }
              } else {
                await signInAnonymously(auth.current);
                setUserId(auth.current.currentUser.uid);
              }
              setIsAuthReady(true);
            }
          });
        } catch (e) {
          console.error("Failed to initialize Firebase:", e);
          setIsAuthReady(true); // Still set to true to allow app to function without Firebase
        }
      } else {
        console.warn("Firebase config not provided. Running without persistence.");
        setIsAuthReady(true); // Allow the app to run without Firebase if config is missing
      }
    };

    initializeFirebase();
  }, []); // Run only once on component mount

  // NOTE: You must include <script src="https://js.puter.com/v2/"></script> in your HTML for Puter.js to work.

  // --- Single file upload for all sheets ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      try {
        const workbook = XLSX.read(data, { type: 'binary', raw: true, codepage: 65001 });
        // Flexible sheet name matching
        let clientsSheet, workersSheet, tasksSheet;
        for (const sheetName of workbook.SheetNames) {
          const parts = sheetName.split(/\s+/).map(s => s.toLowerCase());
          if (!clientsSheet && parts.some(p => p.includes('client'))) {
            clientsSheet = workbook.Sheets[sheetName];
          }
          if (!workersSheet && parts.some(p => p.includes('worker'))) {
            workersSheet = workbook.Sheets[sheetName];
          }
          if (!tasksSheet && parts.some(p => p.includes('task'))) {
            tasksSheet = workbook.Sheets[sheetName];
          }
        }
        if (!clientsSheet && !workersSheet && !tasksSheet) {
          setValidationSummary([{ type: 'error', message: 'No sheets with names including client, worker, or task found in the file.' }]);
          return;
        }
        if (clientsSheet) setClients(XLSX.utils.sheet_to_json(clientsSheet));
        if (workersSheet) setWorkers(XLSX.utils.sheet_to_json(workersSheet));
        if (tasksSheet) setTasks(XLSX.utils.sheet_to_json(tasksSheet));
        setValidationSummary([{ type: 'success', message: 'File loaded. Switch tabs to view each sheet.' }]);
        setActiveTab(clientsSheet ? 'clients' : workersSheet ? 'workers' : 'tasks');
        setFilteredData({});
        setShowFilterResults(false);
      } catch (e) {
        setValidationSummary([{ type: 'error', message: `Failed to parse ${file.name}: ${e.message}` }]);
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Use Puter.js for AI search ---
  const aiSearchWithPuter = async (prompt) => {
    if (!window.puter || !window.puter.ai) {
      setValidationSummary([{ type: 'error', message: 'Puter.js not loaded yet. Please include <script src="https://js.puter.com/v2/"></script> in your HTML.' }]);
      return null;
    }
    try {
      // Use the same pattern as the HTML example
      const response = await window.puter.ai.chat(prompt);
      return response;
    } catch (e) {
      setValidationSummary([{ type: 'error', message: 'Puter.js AI search failed: ' + e.message }]);
      return null;
    }
  };

  // Function to handle natural language queries using Puter.js
  const handleNaturalLanguageQuery = async () => {
    if (!nlQuery.trim()) {
      setValidationSummary([{ type: 'warning', message: 'Please enter a query for natural language search.' }]);
      return;
    }
    setValidationSummary([{ type: 'info', message: 'Processing your natural language query...' }]);
    setShowFilterResults(false);
    const currentData = {
      clients: clients,
      workers: workers,
      tasks: tasks
    }[activeTab];
    if (!currentData || currentData.length === 0) {
      setValidationSummary([{ type: 'error', message: `No ${activeTab} data to search.` }]);
      return;
    }
    // Compose a prompt for Puter.js
    const headers = {
      clients: CLIENT_HEADERS,
      workers: WORKER_HEADERS,
      tasks: TASK_HEADERS
    }[activeTab];
    const sampleRowsForAI = currentData.slice(0, Math.min(currentData.length, 5)).map(row => {
      const rowCopy = { ...row };
      if (Array.isArray(rowCopy.RequestedTaskIDs)) rowCopy.RequestedTaskIDs = rowCopy.RequestedTaskIDs.join(', ');
      if (Array.isArray(rowCopy.Skills)) rowCopy.Skills = rowCopy.Skills.join(', ');
      if (Array.isArray(rowCopy.AvailableSlots)) rowCopy.AvailableSlots = rowCopy.AvailableSlots.join(', ');
      if (Array.isArray(rowCopy.PreferredPhases)) rowCopy.PreferredPhases = `[${rowCopy.PreferredPhases.join(', ')}]`;
      if (typeof rowCopy.AttributesJSON === 'object' && rowCopy.AttributesJSON !== null) rowCopy.AttributesJSON = JSON.stringify(rowCopy.AttributesJSON);
      return rowCopy;
    });
    const prompt = `Given the following ${activeTab} data structure and examples:\nHeaders: ${headers.join(', ')}\nSample Data: ${JSON.stringify(sampleRowsForAI)}\n\nUser Query: "${nlQuery}"\n\nReturn a JSON array of the matching rows.`;
    const aiResult = await aiSearchWithPuter(prompt);
    if (!aiResult) return;
    let filtered = [];
    try {
      filtered = JSON.parse(aiResult);
      setFilteredData(prev => ({ ...prev, [activeTab]: filtered }));
      setShowFilterResults(true);
      setValidationSummary([{ type: 'success', message: `AI search complete. Found ${filtered.length} matching records.` }]);
    } catch (e) {
      setValidationSummary([{ type: 'error', message: 'AI did not return valid JSON. Try rephrasing your query.' }]);
    }
  };

  // Centralized validation function
  const runAllValidations = useCallback(() => {
    const errors = { clients: [], workers: [], tasks: [] };
    const summary = [];
    const allTaskIds = new Set(tasks.map(t => t.TaskID).filter(id => id !== undefined && id !== null));
    const allWorkerSkills = new Set(workers.flatMap(w => w.Skills || [])); // Skills are now arrays

    // Helper for adding errors
    const addError = (tab, rowIdx, colId, message) => {
      errors[tab].push({ rowIdx, colId, message });
    };

    // Client Validations
    clients.forEach((client, idx) => {
      // Missing required column(s)
      if (!client.ClientID) addError('clients', idx, 'ClientID', 'Missing ClientID.');
      if (!client.ClientName) addError('clients', idx, 'ClientName', 'Missing ClientName.');
      if (client.PriorityLevel === undefined || client.PriorityLevel === null) addError('clients', idx, 'PriorityLevel', 'Missing PriorityLevel.');

      // Duplicate ClientIDs
      if (client.ClientID && clients.filter(c => c.ClientID === client.ClientID).length > 1) {
        addError('clients', idx, 'ClientID', `Duplicate ClientID: ${client.ClientID}`);
      }

      // Out-of-range PriorityLevel (not 1-5)
      const priority = Number(client.PriorityLevel);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        addError('clients', idx, 'PriorityLevel', 'PriorityLevel must be between 1 and 5.');
      }

      // Unknown references (RequestedTaskIDs not in tasks)
      if (Array.isArray(client.RequestedTaskIDs)) { // RequestedTaskIDs is now an array
        client.RequestedTaskIDs.forEach(taskId => {
          if (!allTaskIds.has(taskId)) {
            addError('clients', idx, 'RequestedTaskIDs', `Requested TaskID '${taskId}' not found in tasks data.`);
          }
        });
      } else if (client.RequestedTaskIDs !== undefined && client.RequestedTaskIDs !== null && client.RequestedTaskIDs !== '') {
         addError('clients', idx, 'RequestedTaskIDs', `Malformed RequestedTaskIDs. Expected comma-separated list or array.`);
      }

      // Broken JSON in AttributesJSON
      if (client.AttributesJSON && typeof client.AttributesJSON !== 'object') { // AttributesJSON is parsed to object
        addError('clients', idx, 'AttributesJSON', 'Malformed JSON in AttributesJSON.');
      }
    });

    // Worker Validations
    workers.forEach((worker, idx) => {
      // Missing required column(s)
      if (!worker.WorkerID) addError('workers', idx, 'WorkerID', 'Missing WorkerID.');
      if (!worker.WorkerName) addError('workers', idx, 'WorkerName', 'Missing WorkerName.');

      // Duplicate WorkerIDs
      if (worker.WorkerID && workers.filter(w => w.WorkerID === worker.WorkerID).length > 1) {
        addError('workers', idx, 'WorkerID', `Duplicate WorkerID: ${worker.WorkerID}`);
      }

      // Malformed lists (non-numeric in AvailableSlots)
      if (Array.isArray(worker.AvailableSlots)) { // AvailableSlots is now an array of numbers
        if (worker.AvailableSlots.some(isNaN)) {
          addError('workers', idx, 'AvailableSlots', 'AvailableSlots must contain only numbers.');
        }
      } else if (worker.AvailableSlots !== undefined && worker.AvailableSlots !== null && worker.AvailableSlots !== '') {
        addError('workers', idx, 'AvailableSlots', `Malformed AvailableSlots. Expected comma-separated list or array of numbers.`);
      }

      // MaxLoadPerPhase must be a number
      const maxLoad = Number(worker.MaxLoadPerPhase);
      if (isNaN(maxLoad) || maxLoad < 0) {
        addError('workers', idx, 'MaxLoadPerPhase', 'MaxLoadPerPhase must be a non-negative number.');
      }
    });

    // Task Validations
    tasks.forEach((task, idx) => {
      // Missing required column(s)
      if (!task.TaskID) addError('tasks', idx, 'TaskID', 'Missing TaskID.');
      if (!task.TaskName) addError('tasks', idx, 'TaskName', 'Missing TaskName.');
      if (task.Duration === undefined || task.Duration === null) addError('tasks', idx, 'Duration', 'Missing Duration.');

      // Duplicate TaskIDs
      if (task.TaskID && tasks.filter(t => t.TaskID === task.TaskID).length > 1) {
        addError('tasks', idx, 'TaskID', `Duplicate TaskID: ${task.TaskID}`);
      }

      // Duration < 1
      const duration = Number(task.Duration);
      if (isNaN(duration) || duration < 1) {
        addError('tasks', idx, 'Duration', 'Duration must be 1 or greater.');
      }

      // MaxConcurrent must be a non-negative number
      const maxConcurrent = Number(task.MaxConcurrent);
      if (isNaN(maxConcurrent) || maxConcurrent < 0) {
        addError('tasks', idx, 'MaxConcurrent', 'MaxConcurrent must be a non-negative number.');
      }

      // Skill-coverage matrix: every RequiredSkill maps to >=1 worker
      if (Array.isArray(task.RequiredSkills)) { // RequiredSkills is now an array
        task.RequiredSkills.forEach(skill => {
          if (!allWorkerSkills.has(skill)) {
            addError('tasks', idx, 'RequiredSkills', `Required skill '${skill}' for task '${task.TaskID}' is not covered by any worker.`);
          }
        });
      } else if (task.RequiredSkills !== undefined && task.RequiredSkills !== null && task.RequiredSkills !== '') {
        addError('tasks', idx, 'RequiredSkills', `Malformed RequiredSkills. Expected comma-separated list or array.`);
      }
    });


    // Add summary messages based on major issues
    if (errors.clients.length > 0) summary.push({ type: 'error', message: `Found ${errors.clients.length} errors in Clients data.` });
    if (errors.workers.length > 0) summary.push({ type: 'error', message: `Found ${errors.workers.length} errors in Workers data.` });
    if (errors.tasks.length > 0) summary.push({ type: 'error', message: `Found ${errors.tasks.length} errors in Tasks data.` });

    if (summary.length === 0) {
      summary.push({ type: 'success', message: 'All core validations passed! Data looks good.' });
    } else {
      summary.push({ type: 'warning', message: 'Please review the highlighted errors and validation summary.' });
    }

    setValidationErrors(errors);
    setValidationSummary(summary);
  }, [clients, workers, tasks]); // Re-run when data changes


  useEffect(() => {
    // Run validations initially and whenever data changes
    runAllValidations();
  }, [clients, workers, tasks, runAllValidations]); // `runAllValidations` is memoized by useCallback


  // Helper to set data for a specific type and map/parse headers
  const setDataForType = (type, data) => {
    const expectedHeaders = {
      clients: CLIENT_HEADERS,
      workers: WORKER_HEADERS,
      tasks: TASK_HEADERS,
    }[type];

    const mappedAndParsedData = data.map(row => {
      const newRow = {};
      expectedHeaders.forEach(expectedHeader => {
        const foundKey = Object.keys(row).find(key => key.toLowerCase() === expectedHeader.toLowerCase());
        let value = foundKey ? row[foundKey] : undefined;

        // Perform type-specific parsing for known headers
        if (value !== undefined && value !== null && value !== '') {
          switch (expectedHeader) {
            case 'PriorityLevel':
            case 'MaxLoadPerPhase':
            case 'Duration':
            case 'MaxConcurrent':
              value = Number(value);
              break;
            case 'RequestedTaskIDs':
            case 'Skills':
              value = parseCommaSeparated(value);
              break;
            case 'AvailableSlots':
              value = parseCommaSeparated(value).map(Number).filter(n => !isNaN(n));
              break;
            case 'PreferredPhases':
              value = parsePreferredPhases(value);
              break;
            case 'AttributesJSON':
              try {
                value = JSON.parse(value);
              } catch (e) {
                value = value; // Keep as string if malformed, validation will catch it
              }
              break;
            default:
              // Keep as is for other string fields
              break;
          }
        }
        newRow[expectedHeader] = value;
      });
      return newRow;
    });

    switch (type) {
      case 'clients':
        setClients(mappedAndParsedData);
        break;
      case 'workers':
        setWorkers(mappedAndParsedData);
        break;
      case 'tasks':
        setTasks(mappedAndParsedData);
        break;
      default:
        break;
    }
    setActiveTab(type); // Switch to the tab of the uploaded file
    setValidationSummary([{ type: 'info', message: `Successfully loaded ${data.length} records for ${type}.` }]);
    setFilteredData({}); // Clear filters on new upload
    setShowFilterResults(false);
  };

  // Function to handle cell edits
  const handleCellEdit = (rowIndex, columnId, value, tabType) => {
    const updateData = (prevData) => {
      const newData = [...prevData];
      let parsedValue = value;

      // Type conversion for edited cells
      switch (columnId) {
        case 'PriorityLevel':
        case 'MaxLoadPerPhase':
        case 'Duration':
        case 'MaxConcurrent':
          parsedValue = Number(value);
          break;
        case 'RequestedTaskIDs':
        case 'Skills':
        case 'AvailableSlots': // Store as string, then parse for validation/filter
        case 'PreferredPhases': // Store as string, then parse for validation/filter
          // These are stored as strings in the input, will be parsed to arrays for validation/filtering
          break;
        case 'AttributesJSON':
          try {
            parsedValue = JSON.parse(value);
          } catch (e) {
            parsedValue = value; // Keep as string if invalid JSON
          }
          break;
        default:
          break;
      }

      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnId]: parsedValue,
      };
      return newData;
    };

    if (tabType === 'clients') {
      setClients(updateData);
    } else if (tabType === 'workers') {
      setWorkers(updateData);
    } else if (tabType === 'tasks') {
      setTasks(updateData);
    }
  };

  // Generic Table Component (Manual Implementation, replacing React Table)
  const DataTable = ({ data, columns, onCellEdit, tabType, errors }) => {
    const getCellError = (rowIndex, columnId) => {
      return errors.find(err => err.rowIdx === rowIndex && err.colId === columnId);
    };

    // Helper to format array/object data for display in input fields
    const formatValueForDisplay = (value, columnId) => {
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) {
          // Special handling for PreferredPhases to display original string if it was like "1-3"
          if (columnId === 'PreferredPhases' && value.length > 0) {
            // If all elements are consecutive, try to infer a range
            const isConsecutive = value.every((num, i) => i === 0 || num === value[i-1] + 1);
            if (isConsecutive && value.length > 1) {
              return `${value[0]}-${value[value.length - 1]}`;
            }
          }
          return value.join(', ');
      }
      if (typeof value === 'object') {
          return JSON.stringify(value);
      }
      return String(value);
    };

    return (
      <div className="overflow-x-auto rounded-lg shadow-md bg-white">
        <table className="w-full text-left table-auto border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {columns.map(column => (
                <th
                  key={column.accessorKey}
                  className="px-4 py-3 text-sm font-semibold text-gray-700 uppercase tracking-wider text-center border-b border-gray-200"
                  style={{ minWidth: '120px' }} // Apply a minimum width
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length > 0 ? (
              data.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {columns.map(column => {
                    const columnId = column.accessorKey;
                    const cellError = getCellError(rowIndex, columnId);
                    const displayValue = formatValueForDisplay(row[columnId], columnId);
                    return (
                      <td
                        key={columnId}
                        className={`p-2 text-sm text-gray-800 border-b border-gray-200 ${cellError ? 'bg-red-100 border-l-4 border-red-500' : ''}`}
                      >
                        <input
                          type="text"
                          value={displayValue}
                          onChange={(e) => onCellEdit(rowIndex, columnId, e.target.value, tabType)}
                          className={`w-full p-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${cellError ? 'border-red-400' : 'border-gray-200'}`}
                          title={cellError ? cellError.message : ''} // Show error on hover
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-gray-500">
                  No data available. Please upload a file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };


  // Define columns for each data type for the manual table
  const clientColumns = React.useMemo(() => CLIENT_HEADERS.map(header => ({
    accessorKey: header,
    header: header,
  })), []);

  const workerColumns = React.useMemo(() => WORKER_HEADERS.map(header => ({
    accessorKey: header,
    header: header,
  })), []);

  const taskColumns = React.useMemo(() => TASK_HEADERS.map(header => ({
    accessorKey: header,
    header: header,
  })), []);


  // Main UI Structure
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-inter text-gray-800 p-6 flex flex-col items-center">
      <div className="max-w-7xl w-full bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
        <header className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-6 shadow-md">
          <h1 className="text-3xl font-bold flex items-center justify-center">
            <CpuChipIcon className="h-8 w-8 mr-3" /> Data Alchemist: AI Resource Configurator
          </h1>
          <p className="text-center mt-2 text-lg opacity-90">
            Forge order from chaos: upload, validate, and define rules for your data.
          </p>
        </header>

        <main className="p-8">
          {/* File Upload Section */}
          <section className="mb-8 bg-blue-50 p-6 rounded-xl shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <ArrowUpTrayIcon className="h-6 w-6 mr-2 text-blue-600" /> 1. Upload Your Data File (All Sheets)
            </h2>
            <div className="flex flex-col items-center p-4 border border-blue-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
              <label htmlFor="file-upload-all" className="cursor-pointer text-blue-700 hover:text-blue-900 font-medium text-lg mb-2">
                Upload Data File (clients, workers, tasks)
              </label>
              <input
                id="file-upload-all"
                type="file"
                accept=".csv, .xlsx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className="text-sm text-gray-500 mt-1">(.csv or .xlsx, with sheets named clients, workers, tasks)</span>
              {(clients.length > 0 || workers.length > 0 || tasks.length > 0) && (
                <span className="text-sm text-green-600 mt-2">
                  Loaded {clients.length} clients, {workers.length} workers, {tasks.length} tasks.
                </span>
              )}
            </div>
          </section>

          {/* Validation Summary */}
          <section className="mb-8 bg-yellow-50 p-6 rounded-xl shadow-inner border border-yellow-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <ExclamationTriangleIcon className="h-6 w-6 mr-2 text-yellow-600" /> Validation Summary
            </h2>
            <div className="space-y-2">
              {validationSummary.map((item, index) => (
                <p
                  key={index}
                  className={`flex items-center p-3 rounded-md ${
                    item.type === 'error' ? 'bg-red-100 text-red-800' :
                    item.type === 'warning' ? 'bg-orange-100 text-orange-800' :
                    item.type === 'success' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
                  }`}
                >
                  {item.type === 'error' && <ExclamationTriangleIcon className="h-5 w-5 mr-2" />}
                  {item.type === 'warning' && <LightBulbIcon className="h-5 w-5 mr-2" />}
                  {item.type === 'success' && <LightBulbIcon className="h-5 w-5 mr-2" />}
                  {item.type === 'info' && <LightBulbIcon className="h-5 w-5 mr-2" />}
                  {item.message}
                </p>
              ))}
            </div>
          </section>

          {/* Data Grid Section */}
          <section className="mb-8 bg-purple-50 p-6 rounded-xl shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <WrenchScrewdriverIcon className="h-6 w-6 mr-2 text-purple-600" /> 2. Review & Edit Data
            </h2>
            <div className="flex justify-center mb-6">
              {['clients', 'workers', 'tasks'].map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setShowFilterResults(false); // Hide filter results when switching tabs
                  }}
                  className={`px-6 py-2 mx-2 rounded-full font-semibold transition-all duration-200 ease-in-out
                    ${activeTab === tab
                      ? 'bg-purple-600 text-white shadow-lg transform scale-105'
                      : 'bg-white text-purple-700 hover:bg-purple-100 border border-purple-300'
                    }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Natural Language Data Retrieval Input */}
            <div className="mb-6 flex items-center space-x-3">
                <input
                    type="text"
                    value={nlQuery}
                    onChange={(e) => setNlQuery(e.target.value)}
                    placeholder={`Search ${activeTab} data (e.g., "all tasks with Duration > 2")`}
                    className="flex-grow p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <button
                    onClick={() => {
                        handleNaturalLanguageQuery();
                    }}
                    className="bg-blue-600 text-white px-5 py-3 rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200 flex items-center"
                >
                    <MagnifyingGlassIcon className="h-5 w-5 mr-2" /> Search
                </button>
            </div>

            {/* Displaying Data Tables based on active tab */}
            {activeTab === 'clients' && (
              <DataTable
                data={showFilterResults && filteredData.clients ? filteredData.clients : clients}
                columns={clientColumns}
                onCellEdit={handleCellEdit}
                tabType="clients"
                errors={validationErrors.clients || []}
              />
            )}
            {activeTab === 'workers' && (
              <DataTable
                data={showFilterResults && filteredData.workers ? filteredData.workers : workers}
                columns={workerColumns}
                onCellEdit={handleCellEdit}
                tabType="workers"
                errors={validationErrors.workers || []}
              />
            )}
            {activeTab === 'tasks' && (
              <DataTable
                data={showFilterResults && filteredData.tasks ? filteredData.tasks : tasks}
                columns={taskColumns}
                onCellEdit={handleCellEdit}
                tabType="tasks"
                errors={validationErrors.tasks || []}
              />
            )}
          </section>

          {/* User ID Display (for debugging/identification in multi-user context) */}
          {isAuthReady && userId && (
            <div className="text-center text-sm text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg shadow-inner">
              Current User ID: <span className="font-mono text-gray-700 break-all">{userId}</span>
            </div>
          )}

          {/* Placeholder for future sections (Rule Input, Prioritization, Export) */}
          <section className="mb-8 bg-green-50 p-6 rounded-xl shadow-inner border border-green-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <LightBulbIcon className="h-6 w-6 mr-2 text-green-600" /> 3. Define Business Rules (Coming Soon!)
            </h2>
            <p className="text-gray-700">
              This section will allow you to define custom business rules like co-run tasks, slot restrictions, and phase windows.
            </p>
          </section>

          <section className="bg-orange-50 p-6 rounded-xl shadow-inner border border-orange-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <DocumentArrowDownIcon className="h-6 w-6 mr-2 text-orange-600" /> 4. Prioritization & Export (Coming Soon!)
            </h2>
            <p className="text-gray-700">
              Here, you'll be able to set prioritization weights and export your cleaned data and generated rules.json file.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
    