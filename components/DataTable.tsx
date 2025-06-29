"use client";

import { useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ValidationError } from "@/lib/validation";
import { cn } from "@/lib/utils";

type SimpleDataTableProps = {
  data: Record<string, unknown>[];
  validationErrors?: ValidationError[];
  sheetName?: string;
  onDataChange?: (newData: Record<string, unknown>[]) => void;
};

export function SimpleDataTable({
  data,
  validationErrors = [],
  sheetName,
  onDataChange,
}: SimpleDataTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [localData, setLocalData] = useState(data);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data available.</p>;
  }

  const headers = Object.keys(data[0]);
  
  // Extract all unique attribute keys from AttributesJSON columns
  const attributeKeys = new Set<string>();
  data.forEach(row => {
    if (row.AttributesJSON && typeof row.AttributesJSON === 'string') {
      try {
        const attributes = JSON.parse(row.AttributesJSON);
        if (typeof attributes === 'object' && attributes !== null) {
          Object.keys(attributes).forEach(key => attributeKeys.add(key));
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  });

  // Create expanded headers with AttributesJSON sub-columns
  const expandedHeaders: string[] = [];
  headers.forEach(header => {
    if (header === 'AttributesJSON' && attributeKeys.size > 0) {
      // Add the main AttributesJSON column
      expandedHeaders.push(header);
      // Add sub-columns for each attribute key
      Array.from(attributeKeys).sort().forEach(key => {
        expandedHeaders.push(`AttributesJSON.${key}`);
      });
    } else {
      expandedHeaders.push(header);
    }
  });

  // Group errors by row and column for quick lookup
  const errorMap = new Map<string, ValidationError>();
  validationErrors.forEach((error) => {
    if (error.rowIndex >= 0) {
      const key = `${error.rowIndex}-${error.column}`;
      errorMap.set(key, error);
    }
  });

  // Get errors for a specific cell
  const getCellError = (
    rowIndex: number,
    column: string
  ): ValidationError | undefined => {
    return errorMap.get(`${rowIndex}-${column}`);
  };

  // Get all errors for a specific column (for header highlighting)
  const getColumnErrors = (column: string): ValidationError[] => {
    return validationErrors.filter((error) => error.column === column);
  };

  // Get column width class based on column name
  const getColumnWidthClass = (columnName: string): string => {
    const lowerColumnName = columnName.toLowerCase();
    
    // Group-related columns should be wider
    if (lowerColumnName.includes('group') || lowerColumnName === 'grouptag') {
      return 'min-w-[120px] w-[120px]';
    }
    
    // ID columns can be medium width
    if (lowerColumnName.includes('id') && !lowerColumnName.includes('json')) {
      return 'min-w-[80px] w-[80px]';
    }
    
    // Name columns can be wider
    if (lowerColumnName.includes('name')) {
      return 'min-w-[100px] w-[100px]';
    }
    
    // Default width for other columns
    return 'min-w-[80px]';
  };

  // Handle cell click to start editing
  const handleCellClick = (
    rowIndex: number,
    column: string,
    value: unknown
  ) => {
    setEditingCell({ rowIndex, column });
    setEditValue(String(value || ""));
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

  // Handle save changes
  const handleSave = () => {
    if (!editingCell) return;

    const { rowIndex, column } = editingCell;
    const newData = [...localData];

    // Convert value based on the original type
    const originalValue = newData[rowIndex][column];
    let convertedValue: unknown = editValue;

    // Special handling for AttributesJSON column
    if (column === "AttributesJSON" && typeof editValue === "string") {
      const trimmedValue = editValue.trim();

      // If it's not already JSON and looks like a simple sentence, convert it
      if (
        !trimmedValue.startsWith("{") &&
        !trimmedValue.startsWith("[") &&
        !trimmedValue.includes(":")
      ) {
        // Convert simple sentence to JSON with message field
        const jsonObject = { message: trimmedValue };
        convertedValue = JSON.stringify(jsonObject);
        console.log(
          `Auto-converted simple sentence to JSON: "${trimmedValue}" -> "${convertedValue}"`
        );
      } else {
        // Try to parse as JSON to validate
        try {
          JSON.parse(trimmedValue);
          convertedValue = trimmedValue;
        } catch {
          // If it's malformed JSON, keep as string but show error
          convertedValue = trimmedValue;
        }
      }
    } else if (column === "PreferredPhases" && typeof editValue === "string") {
      // Normalize PreferredPhases to a JSON array string
      const normalized = normalizePreferredPhases(editValue);
      convertedValue = JSON.stringify(normalized);
      console.log(
        `Normalized PreferredPhases: "${editValue}" -> "${convertedValue}"`
      );
    } else {
      // Try to preserve the original data type for other columns
      if (typeof originalValue === "number") {
        convertedValue = Number(editValue);
      } else if (typeof originalValue === "boolean") {
        convertedValue = editValue.toLowerCase() === "true";
      } else if (Array.isArray(originalValue)) {
        try {
          convertedValue = JSON.parse(editValue);
        } catch {
          convertedValue = editValue;
        }
      }
    }

    newData[rowIndex] = { ...newData[rowIndex], [column]: convertedValue };
    setLocalData(newData);

    // Notify parent component of data change
    if (onDataChange) {
      onDataChange(newData);
    }

    setEditingCell(null);
    setEditValue("");
  };

  // Handle cancel editing
  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Handle key press in edit mode
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <>
      <div className="w-full max-h-[400px] overflow-auto border rounded-md">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b sticky top-0 bg-white z-10">
            {/* Main header row */}
            <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
              {headers.map((header) => {
                const columnErrors = getColumnErrors(header);
                const hasErrors = columnErrors.length > 0;
                const isAttributesColumn = header === 'AttributesJSON';

                return (
                  <th
                    key={header}
                    className={cn(
                      hasErrors && "bg-red-50 border-red-200",
                      "relative group text-foreground h-10 px-2 text-center align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
                      getColumnWidthClass(header)
                    )}
                    colSpan={isAttributesColumn && attributeKeys.size > 0 ? attributeKeys.size : 1}
                    rowSpan={!isAttributesColumn && attributeKeys.size > 0 ? 2 : 1}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {header}
                      {hasErrors && (
                        <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full">
                          {columnErrors.length}
                        </span>
                      )}
                    </div>
                    {hasErrors && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-full left-0 right-0 bg-red-100 border border-red-300 rounded-b p-2 z-10 max-w-[220px] min-w-[120px] overflow-x-auto whitespace-pre-line break-words">
                            <div className="text-xs font-medium text-red-800 mb-1">
                              Validation Errors:
                            </div>
                            {columnErrors.slice(0, 3).map((error, idx) => (
                              <div
                                key={idx}
                                className="text-xs text-red-700 mb-1 break-words whitespace-pre-line"
                              >
                                {error.message}
                              </div>
                            ))}
                            {columnErrors.length > 3 && (
                              <div className="text-xs text-red-600">
                                +{columnErrors.length - 3} more errors
                              </div>
                            )}
                          </div>
                    )}
                  </th>
                );
              })}
            </tr>
            {/* Sub-header row for AttributesJSON */}
            {attributeKeys.size > 0 && (
              <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                {headers.map((header) => {
                  if (header === 'AttributesJSON') {
                    return (
                      <>
                        {Array.from(attributeKeys).sort().map((key) => (
                          <th
                            key={key}
                            className="bg-gray-100 border-l border-gray-200 text-foreground h-8 px-2 text-left align-middle font-medium text-sm whitespace-nowrap"
                          >
                            {key}
                          </th>
                        ))}
                      </>
                    );
                  } else {
                    return null;
                  }
                })}
              </tr>
            )}
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {localData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  validationErrors.some((e) => e.rowIndex === rowIndex) &&
                    "bg-red-50",
                  "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
                )}
              >
                {headers.map((header) => {
                  if (header === 'AttributesJSON') {
                    // Render only the attribute sub-columns
                    return (
                      <>
                        {Array.from(attributeKeys).sort().map((key) => {
                          let cellValue: unknown;
                          if (row.AttributesJSON && typeof row.AttributesJSON === 'string') {
                            try {
                              const attributes = JSON.parse(row.AttributesJSON);
                              cellValue = attributes[key];
                            } catch (e) {
                              cellValue = undefined;
                            }
                          } else {
                            cellValue = undefined;
                          }

                          return (
                            <td
                              key={`${header}-${key}`}
                              className="bg-gray-50 border-l border-gray-200 p-2 align-middle whitespace-nowrap text-sm text-gray-600"
                            >
                              {formatValue(cellValue)}
                            </td>
                          );
                        })}
                      </>
                    );
                  } else {
                    // Regular column
                    const cellError = getCellError(rowIndex, header);
                    const isEditing =
                      editingCell?.rowIndex === rowIndex &&
                      editingCell?.column === header;

                    return (
                      <td
                        key={header}
                        className={cn(
                          cellError && "bg-red-100 border border-red-300 relative",
                          "group cursor-pointer hover:bg-gray-50 transition-colors p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
                          getColumnWidthClass(header)
                        )}
                        onClick={() => handleCellClick(rowIndex, header, row[header])}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyPress}
                              onBlur={handleSave}
                              autoFocus
                              className="text-sm"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSave();
                                }}
                                className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                              >
                                ✓
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancel();
                                }}
                                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                cellError && "text-red-800 font-medium"
                              )}
                            >
                              {formatValue(row[header])}
                            </span>
                            {cellError && (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-full left-0 right-0 bg-red-100 border border-red-300 rounded p-2 z-20 max-w-[220px] min-w-[120px] overflow-x-auto whitespace-pre-line break-words">
                                    <div className="text-xs text-red-800 font-medium break-words whitespace-pre-line">
                                      {cellError.message}
                                    </div>
                                    {cellError.value !== undefined && (
                                      <div className="text-xs text-red-600 mt-1 break-words whitespace-pre-line">
                                        Value: {String(cellError.value)}
                                      </div>
                                    )}
                                  </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Validation Summary */}
      {validationErrors.length > 0 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <h3 className="font-medium text-red-800">
              Validation Errors ({validationErrors.length})
            </h3>
          </div>
          <div className="text-sm text-red-700 space-y-1">
            {validationErrors.slice(0, 5).map((error, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-red-500">•</span>
                <span>
                  {error.rowIndex >= 0 ? `Row ${error.rowIndex + 1}, ` : ""}
                  {error.column}: {error.message}
                </span>
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div className="text-red-600">
                ... and {validationErrors.length - 5} more errors
              </div>
            )}
          </div>
    </div>
      )}
    </>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
