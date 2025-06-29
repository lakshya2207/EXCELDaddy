# Test Data Examples

## Valid Data Structure

### Clients Sheet
| ClientID | ClientName | PriorityLevel | RequestedTaskIDs | GroupTag | AttributesJSON |
|----------|------------|---------------|------------------|----------|----------------|
| C001 | Client A | 3 | T001,T002 | Group1 | {"region": "US"} |
| C002 | Client B | 2 | T003 | Group2 | {"region": "EU"} |

### Workers Sheet
| WorkerID | WorkerName | Skills | AvailableSlots | MaxLoadPerPhase | WorkerGroup | QualificationLevel |
|----------|------------|--------|----------------|-----------------|-------------|-------------------|
| W001 | Worker A | Skill1,Skill2 | [1,2,3] | 2 | Group1 | Senior |
| W002 | Worker B | Skill2,Skill3 | [2,3,4] | 1 | Group2 | Junior |

### Tasks Sheet
| TaskID | TaskName | Category | Duration | RequiredSkills | PreferredPhases | MaxConcurrent |
|--------|----------|----------|----------|----------------|-----------------|---------------|
| T001 | Task A | Category1 | 5 | Skill1 | [1,2] | 2 |
| T002 | Task B | Category2 | 3 | Skill2 | [2,3] | 1 |
| T003 | Task C | Category1 | 4 | Skill3 | [1,3] | 1 |

## Common Validation Errors

### 1. Missing Required Columns
- Remove any required column to see this error
- Error appears in the column header with a red badge

### 2. Duplicate IDs
- Add duplicate ClientID, WorkerID, or TaskID values
- Error appears on the specific row with the duplicate

### 3. Invalid Priority Level
- Set PriorityLevel to values outside 1-5 range
- Error appears on the specific cell

### 4. Invalid Duration
- Set Duration to values less than 1
- Error appears on the specific cell

### 5. Malformed AvailableSlots
- Use non-numeric values in AvailableSlots
- Error appears on the specific cell

### 6. Invalid JSON
- Use malformed JSON in AttributesJSON
- Error appears on the specific cell

### 7. Unknown Task References
- Reference TaskIDs in RequestedTaskIDs that don't exist in Tasks sheet
- Error appears on the specific cell

### 8. Worker Overload
- Set MaxLoadPerPhase greater than AvailableSlots.length
- Error appears on the specific cell

### 9. Missing Skill Coverage
- Use RequiredSkills that no worker has
- Error appears on the specific cell

### 10. Max Concurrency Issues
- Set MaxConcurrent greater than available qualified workers
- Error appears on the specific cell

### 11. Phase Slot Saturation
- Require more slots in a phase than workers can provide
- Error appears as a general validation error

## How to Test

1. Create an Excel file with the sheets above
2. Introduce various errors from the list above
3. Upload the file to see validation errors highlighted
4. Hover over error cells to see detailed error messages
5. Check the validation summary at the bottom of each table 