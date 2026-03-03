import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { API_URL } from '@/lib/api';
import { Upload, Loader2 } from 'lucide-react';

interface CsvMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvContent: string;
  fileName: string;
  token: string;
  onImportComplete: (result: { imported: number; listId?: string }) => void;
}

interface PreviewData {
  headers: string[];
  detectedMappings: Record<string, number>;
  sampleRows: string[][];
  totalRows: number;
  format: string;
  availableFields: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  job_title: 'Job Title',
  company_name: 'Company Name',
  company_url: 'Company URL',
  industry: 'Industry',
  linkedin_url: 'LinkedIn URL',
  stage: 'Stage',
  estimated_value: 'Value',
  close_date: 'Close Date',
  next_step_date: 'Next Step Date',
  next_step_description: 'Next Step Description',
  priority: 'Priority',
};

const NOT_MAPPED = '__none__';

export default function CsvMappingDialog({
  open,
  onOpenChange,
  csvContent,
  fileName,
  token,
  onImportComplete,
}: CsvMappingDialogProps) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [createList, setCreateList] = useState(false);
  const [listName, setListName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && csvContent) {
      fetchPreview();
    }
  }, [open, csvContent]);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/deals/import/csv/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to preview CSV');
      }

      const data: PreviewData = await response.json();
      setPreview(data);

      // Initialize mappings from detected
      const initialMappings: Record<string, string> = {};
      for (const field of data.availableFields) {
        if (data.detectedMappings[field] !== undefined) {
          initialMappings[field] = data.detectedMappings[field].toString();
        } else {
          initialMappings[field] = NOT_MAPPED;
        }
      }
      setMappings(initialMappings);
      setListName(`Import - ${new Date().toISOString().split('T')[0]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    setImporting(true);
    setError(null);
    try {
      // Build columnMappings from current state
      const columnMappings: Record<string, number> = {};
      for (const [field, value] of Object.entries(mappings)) {
        if (value !== NOT_MAPPED) {
          columnMappings[field] = parseInt(value);
        }
      }

      const response = await fetch(`${API_URL}/deals/import/csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvContent,
          columnMappings,
          createList,
          listName: createList ? listName : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to import CSV');
      }

      const result = await response.json();
      onImportComplete({ imported: result.imported, listId: result.listId });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const updateMapping = (field: string, columnIndex: string) => {
    setMappings(prev => ({ ...prev, [field]: columnIndex }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import CSV: {fileName}</DialogTitle>
          <DialogDescription>
            {preview ? (
              <>
                {preview.totalRows} row(s) detected
                {preview.format !== 'standard' && (
                  <Badge variant="secondary" className="ml-2">{preview.format}</Badge>
                )}
              </>
            ) : 'Loading preview...'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && !preview ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : preview ? (
          <div className="space-y-6">
            {/* Column Mappings */}
            <div>
              <h3 className="text-sm font-medium mb-3">Column Mappings</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-2">
                    <Label className="w-32 text-xs shrink-0">{label}</Label>
                    <Select
                      value={mappings[field] || NOT_MAPPED}
                      onValueChange={(value) => updateMapping(field, value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>-- Not mapped --</SelectItem>
                        {preview.headers.map((header, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Data Preview */}
            {preview.sampleRows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Data Preview</h3>
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleRows.map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {preview.headers.map((_, ci) => (
                            <td key={ci} className="px-2 py-1.5 whitespace-nowrap max-w-[200px] truncate">
                              {row[ci] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Create List Option */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <Switch
                  id="create-list"
                  checked={createList}
                  onCheckedChange={setCreateList}
                />
                <Label htmlFor="create-list" className="text-sm">Create a list from this import</Label>
              </div>
              {createList && (
                <div>
                  <Label className="text-xs text-muted-foreground">List name</Label>
                  <Input
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="Enter list name..."
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-500">{error}</div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || loading || !preview}>
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import {preview?.totalRows || 0} rows
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
