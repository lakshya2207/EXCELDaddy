"use client";

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SimpleDataTable } from "@/components/DataTable";
import {
  validateAllData,
  ValidationError,
  ValidationResult,
} from "@/lib/validation";

// --- Interfaces ---
interface Client {
  ClientID: string;
  ClientName: string;
  PriorityLevel: number;
  RequestedTaskIDs: string[];
  GroupTag: string;
  AttributesJSON: Record<string, unknown>;
}

interface Worker {
  WorkerID: string;
  WorkerName: string;
  Skills: string[];
  AvailableSlots: number[];
  MaxLoadPerPhase: number;
  WorkerGroup: string;
  QualificationLevel: string | number;
}

interface Task {
  TaskID: string;
  TaskName: string;
  Category: string;
  Duration: number;
  RequiredSkills: string[];
  PreferredPhases: number[];
  MaxConcurrent: number;
}

// --- Helpers ---
const parseCSVList = (val: any): string[] =>
  typeof val === "string" ? val.split(",").map((v) => v.trim()) : [];

const parseNumberArray = (val: any): number[] => {
  try {
    if (typeof val === "string") {
      if (val.includes("-")) {
        const [start, end] = val.split("-").map(Number);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        return JSON.parse(val);
      }
    }
    return Array.isArray(val) ? val.map(Number) : [];
  } catch {
    return [];
  }
};

const parseJSON = (val: any): Record<string, unknown> => {
  try {
    return typeof val === "string" ? JSON.parse(val) : {};
  } catch {
    return {};
  }
};

// Normalization function for PreferredPhases
function normalizePreferredPhases(input: string): number[] {
  if (!input) return [];
  // If input is a range like "1-3"
  if (/^\d+\s*-\s*\d+$/.test(input)) {
    const [start, end] = input.split("-").map(Number);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  // If input is a JSON array string or comma-separated
  try {
    if (input.trim().startsWith("[")) {
      return JSON.parse(input);
    }
    // If input is comma-separated numbers
    return input
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => !isNaN(v));
  } catch {
    return [];
  }
}

// Utility to extract and evaluate a filter function from Puter AI's code block response
function extractFilterFunctionFromPuterResponse(
  response: string
): ((row: any, allRows?: any[]) => boolean) | null {
  // Remove code block markers
  const code = response
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
  // Try to evaluate as an anonymous function
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("return (" + code + ")")();
    if (typeof fn === "function") return fn;
  } catch (e) {
    // Try to extract the function body if it's a named function
    try {
      // eslint-disable-next-line no-eval
      eval(code);
      // The function will be defined in the current scope, e.g., filterClientsByHighestPriority
      const match = code.match(/function\s+([a-zA-Z0-9_]+)/);
      if (match) {
        // @ts-ignore
        return eval(match[1]);
      }
    } catch (err) {
      return null;
    }
  }
  return null;
}

// Sample data for prompt context
const sampleClients = [
  {
    ClientID: "C001",
    ClientName: "Alice",
    PriorityLevel: 3,
    RequestedTaskIDs: ["T1", "T2"],
    GroupTag: "A",
    AttributesJSON: { region: "US" },
  },
  {
    ClientID: "C002",
    ClientName: "Bob",
    PriorityLevel: 5,
    RequestedTaskIDs: ["T3"],
    GroupTag: "B",
    AttributesJSON: { region: "EU" },
  },
  {
    ClientID: "C003",
    ClientName: "Charlie",
    PriorityLevel: 5,
    RequestedTaskIDs: ["T2"],
    GroupTag: "A",
    AttributesJSON: { region: "US" },
  },
];
const sampleTasks = [
  {
    TaskID: "T1",
    TaskName: "Task One",
    Category: "CatA",
    Duration: 2,
    RequiredSkills: ["Skill1"],
    PreferredPhases: [1, 2],
    MaxConcurrent: 2,
  },
  {
    TaskID: "T2",
    TaskName: "Task Two",
    Category: "CatB",
    Duration: 4,
    RequiredSkills: ["Skill2"],
    PreferredPhases: [2, 3],
    MaxConcurrent: 1,
  },
];
const sampleWorkers = [
  {
    WorkerID: "W1",
    WorkerName: "John",
    Skills: ["Skill1", "Skill2"],
    AvailableSlots: [1, 2, 3],
    MaxLoadPerPhase: 2,
    WorkerGroup: "A",
    QualificationLevel: "Senior",
  },
  {
    WorkerID: "W2",
    WorkerName: "Jane",
    Skills: ["Skill2"],
    AvailableSlots: [2, 3],
    MaxLoadPerPhase: 1,
    WorkerGroup: "B",
    QualificationLevel: "Junior",
  },
];

export default function StepperDemo() {
  const [fileName, setFileName] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const [workSheets, setWorkSheets] = useState<Record<string, any[]>>({});
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });
  const [searchQueries, setSearchQueries] = useState<{ [tab: string]: string }>(
    {}
  );
  useEffect(() => {
    console.log("workSheets", workSheets);
  }, [workSheets]);

  const [filteredRows, setFilteredRows] = useState<Record<
    string,
    any[]
  > | null>(null);
  const [searchingSheet, setSearchingSheet] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Rules state
  const [rules, setRules] = useState<any[]>([]);
  const [ruleInput, setRuleInput] = useState("");
  const [isProcessingRule, setIsProcessingRule] = useState(false);
  const [showRulesTab, setShowRulesTab] = useState(false);

  const isDataLoaded = Object.keys(workSheets).length > 0;

  useEffect(() => {
    if (!isDataLoaded) return;

    console.log(workSheets, "workSheets");
    console.log("Sheet names:", Object.keys(workSheets));

    // Run validation when data is loaded
    const result = validateAllData(workSheets);
    setValidationResult(result);

    if (!result.isValid) {
      console.log("Validation errors found:", result.errors);
    }
  }, [workSheets]);
  useEffect(() => {
    console.log("filteredRows", filteredRows);
    // console.log("filteredRows", filteredRows);
  }, [filteredRows]);

  // Add a more detailed debug effect
  useEffect(() => {
    if (filteredRows) {
      Object.entries(filteredRows).forEach(([sheetName, rows]) => {
        console.log(`[STATE_DEBUG] ${sheetName}: ${rows.length} filtered rows`);
      });
    }
  }, [filteredRows]);

  // Handle data changes from editable table
  const handleDataChange = (
    sheetName: string,
    newData: Record<string, unknown>[]
  ) => {
    const updatedWorkSheets = { ...workSheets, [sheetName]: newData };
    setWorkSheets(updatedWorkSheets);

    // Re-run validation with updated data
    const result = validateAllData(updatedWorkSheets);
    setValidationResult(result);

    console.log(`Data updated for sheet: ${sheetName}`);
    console.log("New validation result:", result);
  };

  const parseWorkbookToJson = (wb: XLSX.WorkBook) => {
    const sheetData: Record<string, any[]> = {};

    wb.SheetNames.forEach((sheetName) => {
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Clean: remove __EMPTY columns from each row
      const cleaned = json.map((row: any) => {
        const cleanedRow: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          if (!key.startsWith("__EMPTY")) {
            cleanedRow[key] = value;
          }
        });
        return cleanedRow;
      });

      // Normalize PreferredPhases for Tasks sheet
      if (sheetName.toLowerCase().includes("task")) {
        cleaned.forEach((row: any) => {
          if (row.PreferredPhases && typeof row.PreferredPhases === "string") {
            const normalized = normalizePreferredPhases(row.PreferredPhases);
            row.PreferredPhases = JSON.stringify(normalized);
          }
        });
      }

      sheetData[sheetName] = cleaned;
    });

    setWorkSheets(sheetData);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    parseWorkbookToJson(wb);
    setFileName(f.name);
    setSheetLink("");
  };

  const handleLinkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const link = e.target.value;
    setSheetLink(link);
    const match = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = match?.[1];
    if (!sheetId) return;

    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const data = await blob.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      parseWorkbookToJson(wb);
      setFileName(""); // Clear local file name
    } catch (err) {
      console.error(err);
    }
  };

  // Get validation errors for a specific sheet
  const getSheetValidationErrors = (sheetName: string): ValidationError[] => {
    return validationResult.errors.filter((error) => {
      // For sheet-level errors (rowIndex = -1), include them in the specific sheet
      if (error.rowIndex === -1) {
        // Use flexible sheet name matching
        const errorBaseName = error.sheetName
          ?.toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const currentBaseName = sheetName
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        if (
          errorBaseName?.startsWith("client") &&
          currentBaseName.startsWith("client")
        )
          return true;
        if (
          errorBaseName?.startsWith("worker") &&
          currentBaseName.startsWith("worker")
        )
          return true;
        if (
          errorBaseName?.startsWith("task") &&
          currentBaseName.startsWith("task")
        )
          return true;

        return error.sheetName === sheetName;
      }

      // For row-specific errors, check if they belong to this sheet
      return error.sheetName === sheetName;
    });
  };

  // Update handleNaturalSearch to use per-tab query
  async function handleNaturalSearch(sheetName: string) {
    const searchQuery = searchQueries[sheetName] || "";
    if (!searchQuery.trim() || !workSheets[sheetName]) return;
    setSearchingSheet(sheetName);

    // Clear any existing filtered data for this tab before performing new search
    setFilteredRows((prev) => {
      if (prev && prev[sheetName]) {
        const newState = { ...prev };
        delete newState[sheetName];
        console.log(`[SEARCH] Cleared previous filtered data for ${sheetName}`);
        return Object.keys(newState).length === 0 ? null : newState;
      }
      return prev;
    });

    // Get real data from the actual sheet
    const realData = workSheets[sheetName];
    const sampleRows = realData.slice(0, 3); // Take first 3 rows as sample data

    // Define schema and sample data for each sheet
    let schema = "";
    let responseExamples = "";

    if (sheetName.toLowerCase().includes("client")) {
      schema = `Client: { ClientID: string, ClientName: string, PriorityLevel: number, RequestedTaskIDs: string[], GroupTag: string, AttributesJSON: object }`;
      responseExamples = `
Expected response format examples:
1. For "clients with highest priority": 
   (row) => row.PriorityLevel === Math.max(...allRows.map(r => r.PriorityLevel))

2. For "clients with id c23": 
   (row) => row.ClientID === "C23"

3. For "clients in group A": 
   (row) => row.GroupTag === "A"

4. For "clients with priority > 3": 
   (row) => row.PriorityLevel > 3`;
    } else if (sheetName.toLowerCase().includes("task")) {
      schema = `Task: { TaskID: string, TaskName: string, Category: string, Duration: number, RequiredSkills: string[], PreferredPhases: number[], MaxConcurrent: number }`;
      responseExamples = `
Expected response format examples:
1. For "tasks with duration > 2": 
   (row) => row.Duration > 2

2. For "tasks in phase 2": 
   (row) => row.PreferredPhases.includes(2)

3. For "tasks requiring skill1": 
   (row) => row.RequiredSkills.includes("Skill1")

4. For "tasks with max concurrent > 1": 
   (row) => row.MaxConcurrent > 1`;
    } else if (sheetName.toLowerCase().includes("worker")) {
      schema = `Worker: { WorkerID: string, WorkerName: string, Skills: string[], AvailableSlots: number[], MaxLoadPerPhase: number, WorkerGroup: string, QualificationLevel: string | number }`;
      responseExamples = `
Expected response format examples:
1. For "workers with skill2": 
   (row) => row.Skills.includes("Skill2")

2. For "workers available in slot 2": 
   (row) => row.AvailableSlots.includes(2)

3. For "senior workers": 
   (row) => row.QualificationLevel === "Senior"

4. For "workers in group A": 
   (row) => row.WorkerGroup === "A"`;
    }

    const prompt = `You are a JavaScript coding assistant. Your role is to generate a JavaScript filter function for an array named ${sheetName.toLowerCase()}, where each element has the following structure:
${schema}

Here are some sample rows from the actual data:
${JSON.stringify(sampleRows, null, 2)}

User query: ${searchQuery}

${responseExamples}

Please return ONLY a JavaScript filter function (no explanation, no code blocks, just the function) that can be used as ${sheetName.toLowerCase()}.filter(fn). The function should take a row parameter and return true/false. If you need access to all rows for comparisons, use a function that takes two parameters: (row, allRows) => boolean.`;

    console.log("[PuterAI] Prompt:", prompt);
    // @ts-ignore
    if (window.puter && window.puter.ai) {
      // @ts-ignore
      window.puter.ai.chat(prompt).then((aiResponse: any) => {
        let response = aiResponse;
        // If response is an object (from API), extract .result.message.content
        if (
          typeof response === "object" &&
          response.message &&
          response.message.content
        ) {
          response = response.message.content;
        }
        console.log("[PuterAI] Raw response:", response);
        try {
          const filterFn = extractFilterFunctionFromPuterResponse(response);
          console.log("filterFn", filterFn);
          const allRows = workSheets[sheetName];
          if (filterFn) {
            const filtered = allRows.filter((row: any) => {
              try {
                if (filterFn.length === 2) {
                  return filterFn(row, allRows);
                } else {
                  return filterFn(row);
                }
              } catch {
                return false;
              }
            });
            setFilteredRows((prevFilteredRows) => {
              const newState = { ...prevFilteredRows, [sheetName]: filtered };
              console.log("New filteredRows state:", newState);
              return newState;
            });
            console.log(
              `[PuterAI] Filtered ${filtered.length} rows for ${sheetName}`
            );
          } else {
            alert("Could not parse AI filter function 1.\n" + response);
            console.log(
              "[PuterAI] Could not parse AI filter function 1.",
              response
            );
          }
        } catch (err) {
          alert("Could not parse AI filter function 2.\n" + response);
          console.log(
            "[PuterAI] Could not parse AI filter function 2.",
            response
          );
        }
      });
    } else {
      alert("Puter AI is not loaded.");
      console.log("[PuterAI] Puter AI is not loaded.");
    }
  }

  // Rule processing functions
  const processNaturalLanguageRule = async (ruleText: string) => {
    if (!ruleText.trim()) return;

    setIsProcessingRule(true);

    // Get available data for context
    const taskIds =
      workSheets[
        Object.keys(workSheets).find((name) =>
          name.toLowerCase().includes("task")
        ) || ""
      ]?.map((row) => row.TaskID) || [];
    const workerGroups =
      workSheets[
        Object.keys(workSheets).find((name) =>
          name.toLowerCase().includes("worker")
        ) || ""
      ]?.map((row) => row.WorkerGroup) || [];
    const tasksData =
      workSheets[
        Object.keys(workSheets).find((name) =>
          name.toLowerCase().includes("task")
        ) || ""
      ] || [];

    // First, check if this is a task filtering rule (like "tasks with duration 1 2 3")
    if (
      ruleText.toLowerCase().includes("tasks with") ||
      ruleText.toLowerCase().includes("tasks that") ||
      ruleText.toLowerCase().includes("tasks in") ||
      ruleText.toLowerCase().includes("tasks requiring") ||
      ruleText.toLowerCase().includes("tasks having")
    ) {
      // Use Puter AI to find matching tasks
      const filterPrompt = `You are a task filtering assistant. Find tasks that match the given criteria.

Available tasks data:
${JSON.stringify(tasksData.slice(0, 5), null, 2)}

Task schema: { TaskID: string, TaskName: string, Category: string, Duration: number, RequiredSkills: string[], PreferredPhases: number[], MaxConcurrent: number }

User query: "${ruleText}"

Return ONLY a JavaScript filter function that can be used as tasks.filter(fn). The function should take a task parameter and return true/false.

Examples:
- "tasks with duration 1 2 3" → (task) => [1, 2, 3].includes(task.Duration)
- "tasks with duration 1 2 3 must run together" → (task) => [1, 2, 3].includes(task.Duration)
- "tasks in category CatA" → (task) => task.Category === "CatA"
- "tasks in category CatA must run together" → (task) => task.Category === "CatA"
- "tasks requiring skill1" → (task) => task.RequiredSkills.includes("Skill1")
- "tasks requiring skill1 must run together" → (task) => task.RequiredSkills.includes("Skill1")
- "tasks with max concurrent > 2" → (task) => task.MaxConcurrent > 2
- "tasks in phases 1 2" → (task) => task.PreferredPhases.some(phase => [1, 2].includes(phase))

Return ONLY the filter function, no explanation.`;

      try {
        // @ts-ignore
        if (window.puter && window.puter.ai) {
          // @ts-ignore
          const response = await window.puter.ai.chat(filterPrompt);
          let filterCode = response;

          if (
            typeof response === "object" &&
            response.message &&
            response.message.content
          ) {
            filterCode = response.message.content;
          }

          console.log("[RuleAI] Filter response:", filterCode);

          // Extract and execute the filter function
          const filterFn = extractFilterFunctionFromPuterResponse(filterCode);
          if (filterFn) {
            const matchingTasks = tasksData.filter((task: any) => {
              try {
                return filterFn(task);
              } catch {
                return false;
              }
            });

            if (matchingTasks.length >= 2) {
              const coRunRule = {
                type: "coRun",
                tasks: matchingTasks.map((task: any) => task.TaskID),
                id: Date.now(),
              };

              setRules((prev) => [...prev, coRunRule]);
              setRuleInput("");
              console.log("[RuleAI] Co-run rule created:", coRunRule);
            } else {
              alert(
                `Found ${matchingTasks.length} matching tasks. Need at least 2 tasks for a co-run rule.`
              );
            }
          } else {
            alert("Could not parse filter function from AI response");
          }
        } else {
          alert("Puter AI is not loaded.");
        }
      } catch (error) {
        console.error("[RuleAI] Error processing task filter:", error);
        alert("Error processing task filter. Please try again.");
      } finally {
        setIsProcessingRule(false);
      }
      return;
    }

    // Original rule processing for other types
    const prompt = `You are a rule parsing assistant. Convert natural language rules into JSON format.

Available Task IDs: ${taskIds.join(", ")}
Available Worker Groups: ${[...new Set(workerGroups)].join(", ")}

Supported rule types:
1. coRun: Tasks that must run together
2. loadLimit: Limit worker slots per phase
3. slotRestriction: Min shared slots for a group
4. phaseWindow: Task allowed in specific phases

Examples:
- "Tasks T12 and T14 must run together" → {"type": "coRun", "tasks": ["T12", "T14"]}
- "Limit max load of WorkerGroup 'Sales' to 3 slots per phase" → {"type": "loadLimit", "workerGroup": "Sales", "maxSlots": 3}
- "Task T20 can only run in phases 2 to 4" → {"type": "phaseWindow", "task": "T20", "phases": [2, 3, 4]}

User rule: "${ruleText}"

Return ONLY valid JSON, no explanation.`;

    try {
      // @ts-ignore
      if (window.puter && window.puter.ai) {
        // @ts-ignore
        const response = await window.puter.ai.chat(prompt);
        let ruleJson = response;

        if (
          typeof response === "object" &&
          response.message &&
          response.message.content
        ) {
          ruleJson = response.message.content;
        }

        console.log("[RuleAI] Raw response:", ruleJson);

        // Extract JSON from response
        const jsonMatch = ruleJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedRule = JSON.parse(jsonMatch[0]);

          // Validate the rule
          const validationResult = validateRule(
            parsedRule,
            taskIds,
            workerGroups
          );
          if (validationResult.isValid) {
            setRules((prev) => [...prev, { ...parsedRule, id: Date.now() }]);
            setRuleInput("");
            console.log("[RuleAI] Rule added successfully:", parsedRule);
          } else {
            alert(`Rule validation failed: ${validationResult.error}`);
          }
        } else {
          alert("Could not parse rule JSON from AI response");
        }
      } else {
        alert("Puter AI is not loaded.");
      }
    } catch (error) {
      console.error("[RuleAI] Error processing rule:", error);
      alert("Error processing rule. Please try again.");
    } finally {
      setIsProcessingRule(false);
    }
  };

  const validateRule = (
    rule: any,
    taskIds: string[],
    workerGroups: string[]
  ) => {
    switch (rule.type) {
      case "coRun":
        if (
          !rule.tasks ||
          !Array.isArray(rule.tasks) ||
          rule.tasks.length < 2
        ) {
          return {
            isValid: false,
            error: "coRun rule must have at least 2 tasks",
          };
        }
        if (!rule.tasks.every((task: string) => taskIds.includes(task))) {
          return { isValid: false, error: "All tasks must exist in the data" };
        }
        break;
      case "loadLimit":
        if (!rule.workerGroup || !workerGroups.includes(rule.workerGroup)) {
          return {
            isValid: false,
            error: "Worker group must exist in the data",
          };
        }
        if (!rule.maxSlots || rule.maxSlots < 1) {
          return {
            isValid: false,
            error: "maxSlots must be a positive number",
          };
        }
        break;
      case "phaseWindow":
        if (!rule.task || !taskIds.includes(rule.task)) {
          return { isValid: false, error: "Task must exist in the data" };
        }
        if (
          !rule.phases ||
          !Array.isArray(rule.phases) ||
          rule.phases.length === 0
        ) {
          return { isValid: false, error: "phases must be a non-empty array" };
        }
        break;
      default:
        return { isValid: false, error: "Unknown rule type" };
    }
    return { isValid: true };
  };

  const deleteRule = (ruleId: number) => {
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const downloadRules = () => {
    const rulesData = rules.map(({ id, ...rule }) => rule); // Remove internal IDs
    const blob = new Blob([JSON.stringify(rulesData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rules.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getRuleDescription = (rule: any) => {
    switch (rule.type) {
      case "coRun":
        return `Tasks ${rule.tasks?.join(", ")} must run together`;
      case "loadLimit":
        return `Limit ${rule.workerGroup} to ${rule.maxSlots} slots per phase`;
      case "slotRestriction":
        return `Minimum ${rule.minSlots} shared slots for ${rule.workerGroup}`;
      case "phaseWindow":
        return `Task ${rule.task} can only run in phases ${rule.phases?.join(
          ", "
        )}`;
      default:
        return "Unknown rule type";
    }
  };

  return (
    <div className="w-full min-h-screen py-8 px-6 bg-gray-50 space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">ExcelDaddy</h1>
        <p className="text-gray-600 mt-1">
          Forge rules. Balance needs. Export clarity.
        </p>
      </div>

      {/* Quick Start Guide */}
      <Card className="w-full p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
        <h2 className="text-xl font-semibold text-blue-800 mb-3">
          🚀 Quick Start Guide
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">📁 Upload Data</h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Upload Excel/CSV files</li>
              <li>• Or paste Google Sheets link</li>
              <li>• Need Clients, Workers, Tasks sheets</li>
            </ul>
          </div>
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">
              🔍 Search & Filter
            </h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Use natural language search</li>
              <li>• {'"highest priority clients"'}</li>
              <li>• {'"tasks with duration > 2"'}</li>
            </ul>
          </div>
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">📝 Add Rules</h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Type rules in plain English</li>
              <li>• {'"tasks with duration 1 2 3 must run together"'}</li>
              <li>• AI converts to proper format</li>
            </ul>
          </div>
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">✏️ Edit Data</h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Click any cell to edit</li>
              <li>• Press Enter to save</li>
              <li>• Press Escape to cancel</li>
            </ul>
          </div>
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">✅ Validation</h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Red cells show errors</li>
              <li>• Hover for error details</li>
              <li>• Fix inline or see summary</li>
            </ul>
          </div>
          <div className="p-3 bg-white rounded border">
            <h3 className="font-medium text-blue-700 mb-2">📤 Export</h3>
            <ul className="text-blue-600 space-y-1">
              <li>• Download clean CSV files</li>
              <li>• Get rules.json</li>
              <li>• Ready for allocation tools</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Milestone 1 */}
      <Card className="w-full p-6 bg-white shadow-sm space-y-4">
        <h2 className="text-2xl font-semibold text-indigo-700">
          Upload Data File
        </h2>
        <p className="text-gray-700">
          Upload your dataset or provide a link to a Google Sheet.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1">
            <Input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="sm:max-w-xs"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Supported formats: Excel (.xlsx) or CSV files with Clients,
              Workers, and Tasks sheets
            </p>
          </div>
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Paste Google Sheets link"
              value={sheetLink}
              onChange={handleLinkChange}
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Example:
              https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
            </p>
          </div>
        </div>

        {/* Data Format Guide */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-800 mb-2">
            📋 Expected Data Format:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <strong className="text-blue-700">Clients Sheet:</strong>
              <ul className="text-blue-600 mt-1 space-y-1">
                <li>• ClientID, ClientName, PriorityLevel (1-5)</li>
                <li>• RequestedTaskIDs (comma-separated)</li>
                <li>• GroupTag, AttributesJSON</li>
              </ul>
            </div>
            <div>
              <strong className="text-blue-700">Workers Sheet:</strong>
              <ul className="text-blue-600 mt-1 space-y-1">
                <li>• WorkerID, WorkerName, Skills (comma-separated)</li>
                <li>• AvailableSlots (e.g., [1,3,5])</li>
                <li>• MaxLoadPerPhase, WorkerGroup</li>
              </ul>
            </div>
            <div>
              <strong className="text-blue-700">Tasks Sheet:</strong>
              <ul className="text-blue-600 mt-1 space-y-1">
                <li>• TaskID, TaskName, Category, Duration</li>
                <li>• RequiredSkills (comma-separated)</li>
                <li>• {'PreferredPhases (e.g., "1-3" or [2,4,5]'}</li>
              </ul>
            </div>
          </div>
        </div>

        {isDataLoaded && (
          <div className="space-y-2">
            <p className="text-sm text-green-600">
              Successfully loaded {fileName || "Google Sheets data"}.
            </p>

            {/* Validation Status */}
            <div
              className={`p-3 rounded-md ${
                validationResult.isValid
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full ${
                    validationResult.isValid ? "bg-green-500" : "bg-red-500"
                  }`}
                ></div>
                <span
                  className={`font-medium ${
                    validationResult.isValid ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {validationResult.isValid
                    ? "Data validation passed"
                    : `Data validation Error (${validationResult.errors.length} errors found)`}
                </span>
              </div>
              {!validationResult.isValid && (
                <p className="text-sm text-red-700 mt-1">
                  Click on cells to edit and fix validation errors. Press Enter
                  to save or Escape to cancel.
                </p>
              )}

              {/* Validation Tips */}
              {!validationResult.isValid && (
                <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                  <p className="text-xs text-red-700">
                    Please fix the validation errors highlighted in red below.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
      {/* Data Display */}
      {isDataLoaded && (
        <Card className="w-full p-6 bg-white shadow-sm">
          <Tabs
            defaultValue={Object.keys(workSheets)[0]}
            onValueChange={(name) => setSearchingSheet(name)}
          >
            <TabsList>
              {Object.keys(workSheets).map((name) => {
                const sheetErrors = getSheetValidationErrors(name);
                const hasErrors = sheetErrors.length > 0;

                return (
                  <TabsTrigger key={name} value={name} className="relative">
                    {name}
                    {hasErrors && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full">
                        {sheetErrors.length}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(workSheets).map(([name, rows]) => (
              <TabsContent key={name} value={name}>
                {/* Search bar above each table, functional for the current tab only */}
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                  <div className="flex-1">
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="border rounded px-3 py-2 w-full"
                      placeholder={`Search in ${name} (e.g. 'highest priority', 'duration &gt; 2 and phase 2 preferred')`}
                      value={searchQueries[name] || ""}
                      onChange={(e) => {
                        setSearchQueries((q) => ({
                          ...q,
                          [name]: e.target.value,
                        }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleNaturalSearch(name);
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Try : 
                      {name.toLowerCase().includes("client")
                        ? " clients with priority > 3"
                        : name.toLowerCase().includes("task")
                        ? " tasks with duration > 2"
                        : " workers with skill1"}
                    </p>

                    {/* Enhanced search examples */}
                    <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                      <p className="text-xs text-yellow-800 font-medium mb-1">
                        🔍 Search Examples:
                      </p>
                      <div className="text-xs text-yellow-700 space-y-1">
                        {name.toLowerCase().includes("client") && (
                          <>
                            <p>• {'"highest priority clients"'}</p>
                            <p>• {'"clients in group A"'}</p>
                            <p>• {'"clients requesting task T1"'}</p>
                          </>
                        )}
                        {name.toLowerCase().includes("task") && (
                          <>
                            <p>• {'"tasks with duration > 2"'}</p>
                            <p>• {'"tasks in phase 2"'}</p>
                            <p>• {'"tasks requiring skill1"'}</p>
                          </>
                        )}
                        {name.toLowerCase().includes("worker") && (
                          <>
                            <p>• {'"workers with skill2"'}</p>
                            <p>• {'"senior workers"'}</p>
                            <p>• {'"workers available in slot 2"'}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    onClick={() => handleNaturalSearch(name)}
                    disabled={!searchQueries[name]?.trim()}
                  >
                    Search
                  </button>
                  {filteredRows && filteredRows[name]?.length > 0 && (
                    <button
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                      onClick={() => {
                        setSearchQueries((q) => ({ ...q, [name]: "" }));
                        setFilteredRows((prev) => {
                          const newState = { ...prev };
                          delete newState[name];
                          return Object.keys(newState).length === 0
                            ? null
                            : newState;
                        });
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p>
                  {/* { (filteredRows && filteredRows[name]?.length && searchQueries[name]?.length)? filteredRows[name]?.length:'69'} */}
                  {/* {name} */}
                  {filteredRows &&
                    filteredRows[name]?.length > 0 &&
                    searchQueries[name]?.trim().length > 0 && (
                      <span className="ml-2 text-sm text-green-600">
                        (Showing {filteredRows[name].length} filtered results)
                      </span>
                    )}
                </p>
                {(() => {
                  console.log(`[DEBUG] Tab: ${name}`);
                  console.log(`[DEBUG] filteredRows:`, filteredRows);
                  console.log(
                    `[DEBUG] filteredRows[name]:`,
                    filteredRows?.[name]
                  );
                  console.log(
                    `[DEBUG] filteredRows[name]?.length:`,
                    filteredRows?.[name]?.length
                  );
                  console.log(
                    `[DEBUG] searchQueries[name]:`,
                    searchQueries[name]
                  );
                  console.log(
                    `[DEBUG] searchQueries[name]?.length:`,
                    searchQueries[name]?.length
                  );
                  console.log(
                    `[DEBUG] Condition result:`,
                    filteredRows &&
                      filteredRows[name]?.length > 0 &&
                      searchQueries[name]?.length > 0
                  );

                  // Show filtered data ONLY if:
                  // 1. We have filtered data for THIS specific tab
                  // 2. We have a search query for THIS specific tab
                  // 3. The search query is not empty
                  const hasFilteredDataForThisTab =
                    filteredRows &&
                    filteredRows[name] &&
                    filteredRows[name].length > 0;
                  const hasSearchQueryForThisTab =
                    searchQueries[name] &&
                    searchQueries[name].trim().length > 0;

                  const shouldShowFiltered =
                    hasFilteredDataForThisTab && hasSearchQueryForThisTab;

                  console.log(
                    `[DEBUG] hasFilteredDataForThisTab:`,
                    hasFilteredDataForThisTab
                  );
                  console.log(
                    `[DEBUG] hasSearchQueryForThisTab:`,
                    hasSearchQueryForThisTab
                  );
                  console.log(
                    `[DEBUG] shouldShowFiltered:`,
                    shouldShowFiltered
                  );

                  return shouldShowFiltered ? (
                    <SimpleDataTable
                      key={`filtered-${name}`}
                      data={filteredRows[name]}
                      validationErrors={getSheetValidationErrors(name)}
                      sheetName={name}
                      onDataChange={(newData) =>
                        handleDataChange(name, newData)
                      }
                    />
                  ) : (
                    <SimpleDataTable
                      key={`unfiltered-${name}`}
                      data={rows}
                      validationErrors={getSheetValidationErrors(name)}
                      sheetName={name}
                      onDataChange={(newData) =>
                        handleDataChange(name, newData)
                      }
                    />
                  );
                })()}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      )}

      {/* Rules Engine */}
      {isDataLoaded && (
        <Card className="w-full p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-indigo-700">
              Rules Engine
            </h2>
            <button
              onClick={downloadRules}
              disabled={rules.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Download rules.json
            </button>
          </div>

          {/* Rule Input */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-800 mb-3">
              Add New Rule
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={ruleInput}
                  onChange={(e) => setRuleInput(e.target.value)}
                  placeholder="e.g., 'tasks with duration 1 2 3 must run together' or 'Limit max load of WorkerGroup Sales to 3 slots per phase'"
                  className="w-full border rounded px-3 py-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && ruleInput.trim()) {
                      processNaturalLanguageRule(ruleInput);
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Press Enter to add rule. AI will understand natural
                  language and convert to proper format.
                </p>
              </div>
              <button
                onClick={() => processNaturalLanguageRule(ruleInput)}
                disabled={!ruleInput.trim() || isProcessingRule}
                className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isProcessingRule ? "Processing..." : "Add Rule"}
              </button>
            </div>

            {/* Rule Examples */}
            <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">
                📝 Rule Examples:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <strong className="text-blue-700">Task Rules:</strong>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>
                      • &ldquo;tasks with duration 1 2 3 must run
                      together&rdquo;
                    </li>
                    <li>
                      • &ldquo;tasks in category CatA must run together&rdquo;
                    </li>
                    <li>
                      • &ldquo;Task T20 can only run in phases 2 to 4&rdquo;
                    </li>
                  </ul>
                </div>
                <div>
                  <strong className="text-blue-700">Worker Rules:</strong>
                  <ul className="text-blue-600 mt-1 space-y-1">
                    <li>
                      • &ldquo;Limit max load of WorkerGroup Sales to 3 slots
                      per phase&rdquo;
                    </li>
                    <li>
                      • &ldquo;Minimum 2 shared slots for WorkerGroup A&rdquo;
                    </li>
                    <li>
                      • &ldquo;Senior workers can only work in phases 1-3&rdquo;
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-800">
              Current Rules ({rules.length})
            </h3>
            {rules.length === 0 ? (
              <p className="text-gray-500 italic">
                No rules added yet. Add your first rule above.
              </p>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">
                          {rule.type}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getRuleDescription(rule)}
                        </span>
                      </div>
                      <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                        {JSON.stringify(rule, null, 2)}
                      </pre>
                    </div>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live JSON Preview */}
          {rules.length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Rules JSON Preview
              </h3>
              <pre className="bg-white p-4 rounded border overflow-x-auto text-sm">
                {JSON.stringify(
                  rules.map(({ id, ...rule }) => rule),
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Milestone 3 */}
      <Card className="w-full p-6 bg-white shadow-sm">
        <h2 className="text-2xl font-semibold text-indigo-700">
          3. Final Integration
        </h2>
        <p className="text-gray-700">
          Export your rules and data, and deploy the final output.
        </p>

        {/* Usage Guide */}
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-medium text-green-800 mb-2">
            🚀 How to Use ExcelDaddy:
          </h4>
          <div className="text-sm text-green-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span>
                Upload your Excel/CSV file or paste a Google Sheets link above
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span>
                Review validation errors (red cells) and click to edit them
                inline
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>
                Use natural language search in each tab (e.g., &ldquo;highest
                priority clients&rdquo;)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span>
                Add business rules in plain English (e.g., &ldquo;tasks with
                duration 1 2 3 must run together&rdquo;)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold">5.</span>
              <span>
                Download clean data and rules.json for your resource allocation
                system
              </span>
            </div>
          </div>
        </div>

        {/* Pro Tips */}
        <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <h4 className="font-medium text-purple-800 mb-2">💡 Pro Tips:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <strong className="text-purple-700">Data Management:</strong>
              <ul className="text-purple-600 mt-1 space-y-1">
                <li>• Use consistent naming for IDs (C001, W001, T001)</li>
                <li>• Keep skills and categories standardized</li>
                <li>• Validate data before adding complex rules</li>
              </ul>
            </div>
            <div>
              <strong className="text-purple-700">Search & Rules:</strong>
              <ul className="text-purple-600 mt-1 space-y-1">
                <li>• Use specific search terms for better results</li>
                <li>• Combine multiple conditions in rules</li>
                <li>• Test rules with small datasets first</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Export Information */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-800 mb-2">
            📤 Export Information:
          </h4>
          <div className="text-sm text-blue-700 space-y-2">
            <p>
              <strong>Download Rules:</strong> Click &ldquo;Download
              rules.json&rdquo; in the Rules Engine section to get your business
              rules in JSON format.
            </p>
            <p>
              <strong>Data Export:</strong> Clean, validated data is
              automatically available for export to your resource allocation
              system.
            </p>
            <p>
              <strong>Integration:</strong> The exported files are ready to be
              used by downstream allocation and scheduling tools.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
