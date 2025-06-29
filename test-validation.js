// Simple test for duplicate ID validation with actual sheet names
const testData = {
  "Clients 1": [
    { ClientID: 'C001', ClientName: 'Client A', PriorityLevel: 3, RequestedTaskIDs: 'T001,T002', GroupTag: 'Group1', AttributesJSON: '{"region": "US"}' },
    { ClientID: 'C002', ClientName: 'Client B', PriorityLevel: 2, RequestedTaskIDs: 'T003', GroupTag: 'Group2', AttributesJSON: '{"region": "EU"}' },
    { ClientID: 'C001', ClientName: 'Client C', PriorityLevel: 4, RequestedTaskIDs: 'T004', GroupTag: 'Group3', AttributesJSON: '{"region": "ASIA"}' }, // DUPLICATE!
  ],
  "Worker 1": [
    { WorkerID: 'W001', WorkerName: 'Worker A', Skills: 'Skill1,Skill2', AvailableSlots: '[1,2,3]', MaxLoadPerPhase: 2, WorkerGroup: 'Group1', QualificationLevel: 'Senior' },
    { WorkerID: 'W002', WorkerName: 'Worker B', Skills: 'Skill2,Skill3', AvailableSlots: '[2,3,4]', MaxLoadPerPhase: 1, WorkerGroup: 'Group2', QualificationLevel: 'Junior' },
  ],
  "Tasks 1": [
    { TaskID: 'T001', TaskName: 'Task A', Category: 'Category1', Duration: 5, RequiredSkills: 'Skill1', PreferredPhases: '[1,2]', MaxConcurrent: 2 },
    { TaskID: 'T002', TaskName: 'Task B', Category: 'Category2', Duration: 3, RequiredSkills: 'Skill2', PreferredPhases: '[2,3]', MaxConcurrent: 1 },
  ]
};

// Simulate the validation logic with flexible sheet name matching
function getBaseSheetName(sheetName) {
  const cleanName = sheetName.toLowerCase().replace(/\s+/g, ' ').trim();
  
  if (cleanName.startsWith('client')) return 'Clients';
  if (cleanName.startsWith('worker')) return 'Workers';
  if (cleanName.startsWith('task')) return 'Tasks';
  
  return sheetName;
}

function validateDuplicateIDs(sheetName, data) {
  const errors = [];
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
  
  const seen = new Set();
  
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

// Test the validation
console.log('=== Testing Duplicate ID Validation with Actual Sheet Names ===\n');

Object.entries(testData).forEach(([sheetName, data]) => {
  console.log(`\n--- Testing ${sheetName} sheet ---`);
  const errors = validateDuplicateIDs(sheetName, data);
  if (errors.length > 0) {
    console.log('Errors found:', errors);
  } else {
    console.log('No duplicate ID errors found');
  }
});

console.log('\n=== Test Complete ==='); 