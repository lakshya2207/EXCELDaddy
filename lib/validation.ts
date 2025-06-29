// Validation utilities for Excel data

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  rowIndex: number;
  column: string;
  sheetName?: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Required columns for each sheet type
const REQUIRED_COLUMNS = {
  Clients: ['ClientID', 'ClientName', 'PriorityLevel', 'RequestedTaskIDs', 'GroupTag', 'AttributesJSON'],
  Workers: ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase', 'WorkerGroup', 'QualificationLevel'],
  Tasks: ['TaskID', 'TaskName', 'Category', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent']
};

// Helper function to get the base sheet name
function getBaseSheetName(sheetName: string): string {
  // Remove numbers and extra spaces, convert to lowercase for comparison
  const cleanName = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
  
  if (cleanName.startsWith('client')) return 'Clients';
  if (cleanName.startsWith('worker')) return 'Workers';
  if (cleanName.startsWith('task')) return 'Tasks';
  
  return sheetName; // Return original if no match
}

// Validation functions
export function validateRequiredColumns(sheetName: string, data: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  const required = REQUIRED_COLUMNS[baseSheetName as keyof typeof REQUIRED_COLUMNS];
  
  if (!required) return errors;
  
  if (data.length === 0) return errors;
  
  const actualColumns = Object.keys(data[0]);
  const missingColumns = required.filter(col => !actualColumns.includes(col));
  
  missingColumns.forEach(col => {
    errors.push({
      type: 'error',
      message: `Missing required column: ${col}`,
      rowIndex: -1,
      column: col,
      sheetName: sheetName
    });
  });
  
  return errors;
}

export function validateDuplicateIDs(sheetName: string, data: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  const idColumn = baseSheetName === 'Clients' ? 'ClientID' : 
                   baseSheetName === 'Workers' ? 'WorkerID' : 
                   baseSheetName === 'Tasks' ? 'TaskID' : null;
  
  console.log(`Validating duplicate IDs for sheet: ${sheetName} (base: ${baseSheetName}), idColumn: ${idColumn}`);
  console.log(`Data length: ${data.length}`);
  
  if (!idColumn) {
    console.log('No ID column found for this sheet type');
    return errors;
  }
  
  const seen = new Set<string>();
  
  data.forEach((row, index) => {
    const id = row[idColumn];
    console.log(`Row ${index}: ${idColumn} = "${id}"`);
    
    if (id && seen.has(String(id))) {
      console.log(`Duplicate found: ${id} at row ${index}`);
      errors.push({
        type: 'error',
        message: `Duplicate ${idColumn}: ${id}`,
        rowIndex: index,
        column: idColumn,
        sheetName: sheetName,
        value: id
      });
    }
    if (id) seen.add(String(id));
  });
  
  console.log(`Duplicate ID validation complete. Found ${errors.length} errors.`);
  return errors;
}

export function validatePriorityLevel(data: any[], sheetName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  
  // Only validate if this is a Clients sheet
  if (baseSheetName !== 'Clients') return errors;
  
  data.forEach((row, index) => {
    const priority = Number(row.PriorityLevel);
    if (isNaN(priority) || priority < 1 || priority > 5) {
      errors.push({
        type: 'error',
        message: `PriorityLevel must be between 1-5, got: ${row.PriorityLevel}`,
        rowIndex: index,
        column: 'PriorityLevel',
        sheetName: sheetName,
        value: row.PriorityLevel
      });
    }
  });
  
  return errors;
}

export function validateDuration(data: any[], sheetName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  
  // Only validate if this is a Tasks sheet
  if (baseSheetName !== 'Tasks') return errors;
  
  data.forEach((row, index) => {
    const duration = Number(row.Duration);
    if (isNaN(duration) || duration < 1) {
      errors.push({
        type: 'error',
        message: `Duration must be >= 1, got: ${row.Duration}`,
        rowIndex: index,
        column: 'Duration',
        sheetName: sheetName,
        value: row.Duration
      });
    }
  });
  
  return errors;
}

export function validateAvailableSlots(data: any[], sheetName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  
  // Only validate if this is a Workers sheet
  if (baseSheetName !== 'Workers') return errors;
  
  data.forEach((row, index) => {
    const slots = parseNumberArray(row.AvailableSlots);
    const hasNonNumeric = slots.some(slot => isNaN(slot));
    
    if (hasNonNumeric) {
      errors.push({
        type: 'error',
        message: `AvailableSlots contains non-numeric values: ${row.AvailableSlots}`,
        rowIndex: index,
        column: 'AvailableSlots',
        sheetName: sheetName,
        value: row.AvailableSlots
      });
    }
  });
  
  return errors;
}

export function validateAttributesJSON(data: any[], sheetName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const baseSheetName = getBaseSheetName(sheetName);
  
  // Only validate if this is a Clients sheet
  if (baseSheetName !== 'Clients') return errors;
  
  data.forEach((row, index) => {
    try {
      if (row.AttributesJSON && typeof row.AttributesJSON === 'string') {
        // Check if it's already valid JSON
        try {
          JSON.parse(row.AttributesJSON);
        } catch {
          // If it's not valid JSON, check if it's a simple sentence
          const trimmedValue = row.AttributesJSON.trim();
          
          // If it looks like a simple sentence (not JSON), convert it
          if (!trimmedValue.startsWith('{') && !trimmedValue.startsWith('[') && !trimmedValue.includes(':')) {
            // Convert simple sentence to JSON with message field
            const jsonObject = { message: trimmedValue };
            const jsonString = JSON.stringify(jsonObject);
            
            // Update the row data with the converted JSON
            row.AttributesJSON = jsonString;
            
            console.log(`Converted simple sentence to JSON for row ${index}: "${trimmedValue}" -> "${jsonString}"`);
          } else {
            // It looks like JSON but is malformed
            errors.push({
              type: 'error',
              message: `Invalid JSON in AttributesJSON: ${row.AttributesJSON}`,
              rowIndex: index,
              column: 'AttributesJSON',
              sheetName: sheetName,
              value: row.AttributesJSON
            });
          }
        }
      }
    } catch (err) {
      errors.push({
        type: 'error',
        message: `Invalid JSON in AttributesJSON: ${row.AttributesJSON}`,
        rowIndex: index,
        column: 'AttributesJSON',
        sheetName: sheetName,
        value: row.AttributesJSON
      });
    }
  });
  
  return errors;
}

export function validateTaskReferences(clients: any[], tasks: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const taskIds = new Set(tasks.map(t => t.TaskID));
  
  clients.forEach((client, index) => {
    const requestedTasks = parseCSVList(client.RequestedTaskIDs);
    const invalidTasks = requestedTasks.filter(taskId => !taskIds.has(taskId));
    
    invalidTasks.forEach(taskId => {
      errors.push({
        type: 'error',
        message: `RequestedTaskID "${taskId}" not found in Tasks sheet`,
        rowIndex: index,
        column: 'RequestedTaskIDs',
        sheetName: 'Clients',
        value: taskId
      });
    });
  });
  
  return errors;
}

export function validateWorkerOverload(workers: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  workers.forEach((worker, index) => {
    const availableSlots = parseNumberArray(worker.AvailableSlots);
    const maxLoad = Number(worker.MaxLoadPerPhase);
    
    if (availableSlots.length < maxLoad) {
      errors.push({
        type: 'error',
        message: `Worker has ${availableSlots.length} available slots but MaxLoadPerPhase is ${maxLoad}`,
        rowIndex: index,
        column: 'MaxLoadPerPhase',
        sheetName: 'Workers',
        value: maxLoad
      });
    }
  });
  
  return errors;
}

export function validateSkillCoverage(workers: any[], tasks: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const workerSkills = new Set<string>();
  
  workers.forEach(worker => {
    const skills = parseCSVList(worker.Skills);
    skills.forEach(skill => workerSkills.add(skill));
  });
  
  tasks.forEach((task, index) => {
    const requiredSkills = parseCSVList(task.RequiredSkills);
    const missingSkills = requiredSkills.filter(skill => !workerSkills.has(skill));
    
    missingSkills.forEach(skill => {
      errors.push({
        type: 'error',
        message: `Required skill "${skill}" not available in any worker`,
        rowIndex: index,
        column: 'RequiredSkills',
        sheetName: 'Tasks',
        value: skill
      });
    });
  });
  
  return errors;
}

export function validateMaxConcurrency(tasks: any[], workers: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  tasks.forEach((task, index) => {
    const maxConcurrent = Number(task.MaxConcurrent);
    const requiredSkills = parseCSVList(task.RequiredSkills);
    
    // Count workers with required skills
    const qualifiedWorkers = workers.filter(worker => {
      const workerSkills = parseCSVList(worker.Skills);
      return requiredSkills.some(skill => workerSkills.includes(skill));
    });
    
    if (qualifiedWorkers.length < maxConcurrent) {
      errors.push({
        type: 'error',
        message: `MaxConcurrent (${maxConcurrent}) exceeds qualified workers (${qualifiedWorkers.length})`,
        rowIndex: index,
        column: 'MaxConcurrent',
        sheetName: 'Tasks',
        value: maxConcurrent
      });
    }
  });
  
  return errors;
}

export function validateCircularCoRunGroups(clients: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Build dependency graph
  const dependencies = new Map<string, Set<string>>();
  
  clients.forEach(client => {
    const groupTag = client.GroupTag;
    if (!dependencies.has(groupTag)) {
      dependencies.set(groupTag, new Set());
    }
  });
  
  // Check for circular dependencies in group tags
  // This is a simplified check - in a real implementation, you'd need more complex logic
  // based on the specific business rules for co-run groups
  
  return errors;
}

export function validatePhaseSlotSaturation(tasks: any[], workers: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Calculate total available slots per phase
  const phaseSlots = new Map<number, number>();
  
  workers.forEach(worker => {
    const availableSlots = parseNumberArray(worker.AvailableSlots);
    const maxLoad = Number(worker.MaxLoadPerPhase);
    
    availableSlots.forEach(phase => {
      const currentSlots = phaseSlots.get(phase) || 0;
      phaseSlots.set(phase, currentSlots + maxLoad);
    });
  });
  
  // Calculate required slots per phase
  const phaseRequirements = new Map<number, number>();
  
  tasks.forEach(task => {
    const duration = Number(task.Duration);
    const preferredPhases = parseNumberArray(task.PreferredPhases);
    const maxConcurrent = Number(task.MaxConcurrent);
    
    preferredPhases.forEach(phase => {
      const currentReq = phaseRequirements.get(phase) || 0;
      phaseRequirements.set(phase, currentReq + (duration * maxConcurrent));
    });
  });
  
  // Check for saturation
  phaseRequirements.forEach((required, phase) => {
    const available = phaseSlots.get(phase) || 0;
    if (required > available) {
      errors.push({
        type: 'error',
        message: `Phase ${phase} requires ${required} slots but only ${available} are available`,
        rowIndex: -1,
        column: 'PreferredPhases',
        sheetName: 'Tasks',
        value: `Phase ${phase}`
      });
    }
  });
  
  return errors;
}

export function validateConflictingRules(tasks: any[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // This would implement business rule validation
  // For now, we'll add a placeholder for future implementation
  
  return errors;
}

// Helper functions
function parseCSVList(val: any): string[] {
  if (typeof val === "string") {
    return val.split(",").map((v: string) => v.trim()).filter(Boolean);
  }
  return Array.isArray(val) ? val.map(String) : [];
}

function parseNumberArray(val: any): number[] {
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
}

// Main validation function
export function validateAllData(workSheets: Record<string, any[]>): ValidationResult {
  const allErrors: ValidationError[] = [];
  
  console.log('Starting validation of all data...');
  console.log('Available sheets:', Object.keys(workSheets));
  
  // Validate each sheet
  Object.entries(workSheets).forEach(([sheetName, data]) => {
    console.log(`\n--- Validating sheet: ${sheetName} ---`);
    console.log(`Sheet data length: ${data.length}`);
    if (data.length > 0) {
      console.log('Sample row:', data[0]);
    }
    
    // Required columns
    allErrors.push(...validateRequiredColumns(sheetName, data));
    
    // Duplicate IDs
    allErrors.push(...validateDuplicateIDs(sheetName, data));
    
    // Sheet-specific validations
    const baseSheetName = getBaseSheetName(sheetName);
    if (baseSheetName === 'Clients') {
      allErrors.push(...validatePriorityLevel(data, sheetName));
      allErrors.push(...validateAttributesJSON(data, sheetName));
    }
    
    if (baseSheetName === 'Workers') {
      allErrors.push(...validateAvailableSlots(data, sheetName));
    }
    
    if (baseSheetName === 'Tasks') {
      allErrors.push(...validateDuration(data, sheetName));
    }
  });
  
  // Cross-sheet validations
  const clientsSheet = Object.keys(workSheets).find(name => getBaseSheetName(name) === 'Clients');
  const workersSheet = Object.keys(workSheets).find(name => getBaseSheetName(name) === 'Workers');
  const tasksSheet = Object.keys(workSheets).find(name => getBaseSheetName(name) === 'Tasks');
  
  if (clientsSheet && tasksSheet) {
    const refErrors = validateTaskReferences(workSheets[clientsSheet], workSheets[tasksSheet]);
    // Update sheet names to actual sheet names
    refErrors.forEach(error => {
      error.sheetName = clientsSheet;
    });
    allErrors.push(...refErrors);
  }
  
  if (workersSheet) {
    const overloadErrors = validateWorkerOverload(workSheets[workersSheet]);
    // Update sheet names to actual sheet names
    overloadErrors.forEach(error => {
      error.sheetName = workersSheet;
    });
    allErrors.push(...overloadErrors);
  }
  
  if (workersSheet && tasksSheet) {
    const skillErrors = validateSkillCoverage(workSheets[workersSheet], workSheets[tasksSheet]);
    const concurrencyErrors = validateMaxConcurrency(workSheets[tasksSheet], workSheets[workersSheet]);
    const saturationErrors = validatePhaseSlotSaturation(workSheets[tasksSheet], workSheets[workersSheet]);
    
    // Update sheet names to actual sheet names
    skillErrors.forEach(error => {
      error.sheetName = tasksSheet;
    });
    concurrencyErrors.forEach(error => {
      error.sheetName = tasksSheet;
    });
    saturationErrors.forEach(error => {
      error.sheetName = tasksSheet;
    });
    
    allErrors.push(...skillErrors);
    allErrors.push(...concurrencyErrors);
    allErrors.push(...saturationErrors);
  }
  
  if (clientsSheet) {
    allErrors.push(...validateCircularCoRunGroups(workSheets[clientsSheet]));
  }
  
  if (tasksSheet) {
    allErrors.push(...validateConflictingRules(workSheets[tasksSheet]));
  }
  
  console.log(`\n=== Validation complete ===`);
  console.log(`Total errors found: ${allErrors.length}`);
  console.log('All errors:', allErrors);
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors
  };
} 