# Excel Data Validation System

This document describes the comprehensive validation system implemented for Excel data processing in the ExcelDaddy application.

## Overview

The validation system performs real-time validation of Excel data across multiple sheets (Clients, Workers, Tasks) and provides visual feedback with error highlighting on specific columns and rows.

## Validation Rules Implemented

### 1. Required Column Validation
- **Rule**: All required columns must be present in each sheet
- **Validation**: Checks for missing columns in Clients, Workers, and Tasks sheets
- **Error Display**: Shows in column headers with red badges

### 2. Duplicate ID Validation
- **Rule**: No duplicate IDs allowed (ClientID, WorkerID, TaskID)
- **Validation**: Checks for duplicate values in ID columns
- **Error Display**: Highlights specific rows with duplicates

### 3. Data Type and Range Validation
- **PriorityLevel**: Must be between 1-5
- **Duration**: Must be >= 1
- **AvailableSlots**: Must contain only numeric values
- **Error Display**: Highlights specific cells with invalid values

### 4. JSON Format Validation
- **Rule**: AttributesJSON must be valid JSON format
- **Validation**: Attempts to parse JSON strings
- **Error Display**: Highlights cells with malformed JSON

### 5. Cross-Reference Validation
- **Rule**: RequestedTaskIDs must reference existing TaskIDs
- **Validation**: Checks if referenced tasks exist in Tasks sheet
- **Error Display**: Highlights cells with invalid references

### 6. Worker Capacity Validation
- **Rule**: MaxLoadPerPhase <= AvailableSlots.length
- **Validation**: Ensures workers aren't overloaded
- **Error Display**: Highlights cells with capacity issues

### 7. Skill Coverage Validation
- **Rule**: Every RequiredSkill must be available in at least one worker
- **Validation**: Checks skill availability across all workers
- **Error Display**: Highlights tasks with missing skill coverage

### 8. Concurrency Validation
- **Rule**: MaxConcurrent <= count of qualified workers
- **Validation**: Ensures enough workers for concurrent execution
- **Error Display**: Highlights tasks with concurrency issues

### 9. Phase Slot Saturation Validation
- **Rule**: Total required slots per phase <= total available slots
- **Validation**: Calculates slot requirements vs availability
- **Error Display**: Shows general validation errors

### 10. Circular Dependency Validation (Placeholder)
- **Rule**: No circular dependencies in co-run groups
- **Validation**: Placeholder for future implementation
- **Error Display**: Not yet implemented

### 11. Business Rule Validation (Placeholder)
- **Rule**: Custom business rules vs phase-window constraints
- **Validation**: Placeholder for future implementation
- **Error Display**: Not yet implemented

## Technical Implementation

### File Structure
```
lib/
  validation.ts          # Core validation logic
components/
  DataTable.tsx         # Enhanced table with error highlighting
app/
  page.tsx              # Main application with validation integration
```

### Key Components

#### ValidationError Interface
```typescript
interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  rowIndex: number;
  column: string;
  sheetName?: string;
  value?: any;
}
```

#### ValidationResult Interface
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}
```

### Validation Functions

1. `validateRequiredColumns()` - Checks for missing columns
2. `validateDuplicateIDs()` - Checks for duplicate IDs
3. `validatePriorityLevel()` - Validates priority range
4. `validateDuration()` - Validates duration values
5. `validateAvailableSlots()` - Validates slot format
6. `validateAttributesJSON()` - Validates JSON format
7. `validateTaskReferences()` - Validates cross-references
8. `validateWorkerOverload()` - Validates worker capacity
9. `validateSkillCoverage()` - Validates skill availability
10. `validateMaxConcurrency()` - Validates concurrency limits
11. `validatePhaseSlotSaturation()` - Validates phase capacity
12. `validateCircularCoRunGroups()` - Placeholder for circular dependencies
13. `validateConflictingRules()` - Placeholder for business rules

### UI Features

#### Error Highlighting
- **Column Headers**: Red background with error count badges
- **Error Cells**: Red background with hover tooltips
- **Error Rows**: Light red background for rows with errors
- **Validation Summary**: Detailed error list below each table

#### Interactive Elements
- **Hover Tooltips**: Show detailed error messages on cell hover
- **Error Counts**: Display number of errors per column/sheet
- **Validation Status**: Overall validation status indicator
- **Tab Indicators**: Error counts on sheet tabs

## Usage

### Basic Usage
1. Upload Excel file or provide Google Sheets link
2. Validation runs automatically when data is loaded
3. Errors are highlighted in the UI immediately
4. Hover over error cells for detailed messages

### Error Resolution
1. Fix errors in the source Excel file
2. Re-upload the corrected file
3. Validation will re-run automatically
4. Continue until all errors are resolved

## Testing

Use the provided `test-data.md` file to create test Excel files with various validation scenarios. The file includes:

- Valid data structure examples
- Common error scenarios
- Testing instructions

## Future Enhancements

1. **Circular Dependency Detection**: Implement proper circular dependency checking
2. **Business Rule Engine**: Add custom business rule validation
3. **Real-time Validation**: Validate as user types in editable cells
4. **Export Validation Report**: Generate detailed validation reports
5. **Auto-fix Suggestions**: Provide suggestions for common errors
6. **Validation Rules Editor**: Allow users to define custom validation rules

## Performance Considerations

- Validation runs on data load, not on every keystroke
- Error mapping uses efficient Map data structures
- UI updates are optimized to minimize re-renders
- Large datasets are handled with pagination considerations

## Error Handling

- Graceful handling of malformed data
- Clear error messages for users
- Fallback values for missing data
- Comprehensive logging for debugging 