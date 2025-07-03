
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, FileText as FileTextIcon, Divide, Calendar as CalendarIcon, ChevronDown, ChevronUp, Download } from 'lucide-react';
import React, { useEffect, useState, useCallback, useMemo } from 'react';

// --- Student-specific imports ---
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import type { SearchableItem } from '@/components/common/SearchWithSuggestions';

// --- Admin-specific imports ---
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import ViewImageModal from '@/components/home/ViewImageModal';
import AppLogo from '@/components/common/AppLogo';
import { cn } from '@/lib/utils';
import SearchWithSuggestions from '@/components/common/SearchWithSuggestions';
import { useToast } from '@/hooks/use-toast';

// Combined type for admin dashboard data
type AdminDashboardData = (UserImage & {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNo?: string;
});

// Type for grouping certificates by student for the default admin view
type StudentWithCertificates = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNo?: string;
  certificates: AdminDashboardData[];
};


// ====================================================================================
// Student Home Page Content
// ====================================================================================
function StudentHomePageContent() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { user, userId } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  useEffect(() => {
    const fetchImages = async () => {
      if (!userId || !user) {
        setIsLoading(false);
        setImages([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/user-images?userId=${userId}`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to load certificates.');
        }
        const data: UserImage[] = await response.json();
        setImages(data);
      } catch (err: any) {
        setError(err.message);
        toast({ title: "Error Loading Certificates", description: err.message, variant: "destructive" });
        setImages([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchImages();
  }, [userId, user, toast, refreshKey]);

  const handleSearch = (query: string) => setSearchTerm(query.toLowerCase());

  const filteredImages = useMemo(() => {
    if (!searchTerm) return images;
    return images.filter(image => 
      (image.originalName?.toLowerCase() || '').includes(searchTerm) ||
      (image.filename?.toLowerCase() || '').includes(searchTerm)
    );
  }, [images, searchTerm]);

  const searchableImageNames: SearchableItem[] = useMemo(() =>
    images.map(img => ({ id: img.fileId, value: img.originalName || img.filename })),
    [images]
  );

  return (
    <div className="container mx-auto flex h-full flex-col px-2 py-4 sm:px-4 md:py-8">
      <div className="flex shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="text-center md:text-left">
            <h1 className="text-2xl font-bold font-headline sm:text-3xl md:text-4xl">Your Certificate Hub</h1>
            <p className="text-base text-muted-foreground sm:text-lg">Browse, upload, and manage your certificates.</p>
        </div>
      </div>
      <div className="my-4 shrink-0">
        <SearchWithSuggestions 
          onSearch={handleSearch} 
          placeholder="Search certificates by name or filename..."
          searchableData={searchableImageNames}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 md:overflow-visible md:pr-0">
        <ImageGrid
          images={filteredImages}
          isLoading={isLoading}
          error={error}
          onImageDeleted={triggerRefresh}
          currentUserId={userId}
        />
      </div>
      <UploadFAB onUploadSuccess={triggerRefresh} />
      <AiFAB />
    </div>
  );
}

// ====================================================================================
// Admin Home Page Content (New Dashboard)
// ====================================================================================
function AdminHomePageContent() {
    const [allData, setAllData] = useState<AdminDashboardData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    // Filter states
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);

    // UI state
    const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
    const [selectedImageForView, setSelectedImageForView] = useState<UserImage | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            setError(null);
            try {
                const idToken = await user.getIdToken();
                const response = await fetch('/api/admin/dashboard-data', {
                    headers: { 'Authorization': `Bearer ${idToken}` },
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch dashboard data.');
                }
                const data: AdminDashboardData[] = await response.json();
                data.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
                setAllData(data);
            } catch (err: any) {
                setError(err.message);
                toast({ title: "Error Loading Dashboard", description: err.message, variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user, toast]);
    
    const uniqueStudents = useMemo(() => {
      const studentMap = new Map<string, { studentId: string; studentName: string }>();
      allData.forEach(cert => {
          if (!studentMap.has(cert.studentId)) {
              studentMap.set(cert.studentId, { studentId: cert.studentId, studentName: cert.studentName });
          }
      });
      return Array.from(studentMap.values()).sort((a,b) => a.studentName.localeCompare(b.studentName));
    }, [allData]);

    const filteredData = useMemo(() => {
        let data = allData;

        // Date filter
        if (dateRange?.from) data = data.filter(d => isAfter(new Date(d.uploadDate), startOfMonth(dateRange.from!)));
        if (dateRange?.to) data = data.filter(d => isBefore(new Date(d.uploadDate), endOfMonth(dateRange.to!)));
        
        // Student filter
        if (selectedStudentIds.length > 0) data = data.filter(d => selectedStudentIds.includes(d.studentId));
        
        // Search filter
        if (searchTerm) data = data.filter(d => d.originalName.toLowerCase().includes(searchTerm.toLowerCase()));

        return data;
    }, [allData, dateRange, selectedStudentIds, searchTerm]);
    
    const searchAnalysisData = useMemo(() => {
        if (!searchTerm) return [];
        const studentMap = new Map<string, number>();
        filteredData.forEach(cert => {
            studentMap.set(cert.studentName, (studentMap.get(cert.studentName) || 0) + 1);
        });
        return Array.from(studentMap.entries())
            .map(([name, count]) => ({ name, certificates: count }))
            .sort((a, b) => b.certificates - a.certificates);
    }, [filteredData, searchTerm]);


    const kpiStats = useMemo(() => {
        const dataForKpi = filteredData; // Use filtered data for KPIs
        const studentSet = new Set(dataForKpi.map(d => d.studentId));
        const totalCerts = dataForKpi.length;
        const totalStudents = studentSet.size;
        return {
            totalStudents: totalStudents,
            totalCerts: totalCerts,
            avgCertsPerStudent: totalStudents > 0 ? (totalCerts / totalStudents).toFixed(1) : '0.0',
        };
    }, [filteredData]);

    const monthlyUploads = useMemo(() => {
        const countsByMonth: { [key: string]: number } = {};
        filteredData.forEach(cert => {
            const month = format(new Date(cert.uploadDate), 'MMM yyyy');
            countsByMonth[month] = (countsByMonth[month] || 0) + 1;
        });
        return Object.entries(countsByMonth).map(([month, count]) => ({ month, certificates: count }))
          .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
    }, [filteredData]);

    const topStudentsData = useMemo(() => {
        const studentMap = new Map<string, number>();
        filteredData.forEach(cert => {
            studentMap.set(cert.studentName, (studentMap.get(cert.studentName) || 0) + 1);
        });
        return Array.from(studentMap.entries())
            .map(([name, count]) => ({ name, certificates: count }))
            .sort((a, b) => b.certificates - a.certificates)
            .slice(0, 5) // Show top 5
            .reverse();
    }, [filteredData]);
    
    const studentsWithCertsForTable = useMemo(() => {
        if (searchTerm) return []; // Don't show grouped view when searching
        const studentGroups: { [key: string]: StudentWithCertificates } = {};
        filteredData.forEach(cert => {
            if (!studentGroups[cert.studentId]) {
                studentGroups[cert.studentId] = {
                    studentId: cert.studentId, studentName: cert.studentName,
                    studentEmail: cert.studentEmail, studentRollNo: cert.studentRollNo,
                    certificates: [],
                };
            }
            studentGroups[cert.studentId].certificates.push(cert);
        });
        return Object.values(studentGroups);
    }, [filteredData, searchTerm]);
    
    const searchableItems: SearchableItem[] = useMemo(() => {
        const certNames = new Set(allData.map(d => d.originalName));
        return Array.from(certNames).map(name => ({ id: name, value: name }));
    }, [allData]);

    const handleDownloadZip = async () => {
      if (!user || filteredData.length === 0) return;
      setIsDownloading(true);
      toast({ title: "Preparing Download", description: `Zipping ${filteredData.length} certificate(s)...`});
      try {
        const idToken = await user.getIdToken();
        const fileIds = filteredData.map(cert => cert.fileId);
        const response = await fetch('/api/admin/download-zip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ fileIds }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to generate zip file.');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CertIntel_Export_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast({ title: "Download Started", description: "Your zip file is downloading."});
      } catch (err: any) {
        toast({ title: "Download Failed", description: err.message, variant: 'destructive'});
      } finally {
        setIsDownloading(false);
      }
    };


    const handleStudentFilterChange = (studentId: string, checked: boolean) => {
        setSelectedStudentIds(prev =>
            checked ? [...prev, studentId] : prev.filter(id => id !== studentId)
        );
    };

    const toggleStudentExpansion = (studentId: string) => {
        setExpandedStudents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(studentId)) newSet.delete(studentId);
            else newSet.add(studentId);
            return newSet;
        });
    };
    
    const openViewModal = (image: UserImage) => {
        setSelectedImageForView(image);
        setIsViewModalOpen(true);
    };

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-16 w-16 animate-spin text-primary" /><p className="ml-4 text-lg">Loading Admin Dashboard...</p></div>;
    }
    
    if (error) {
        return <div className="container py-8 text-center text-destructive">{error}</div>;
    }

    return (
        <div className="flex min-h-screen bg-background">
          <aside className="w-64 flex-shrink-0 bg-sidebar-background text-sidebar-foreground p-4 flex flex-col gap-6">
              <div className="flex items-center gap-2">
                  <AppLogo size={8} iconOnly/>
                  <h2 className="text-xl font-bold">CertIntel</h2>
              </div>
              <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-sidebar-foreground/70 tracking-wider uppercase">Filters</h3>
                  
                  <div className="space-y-2">
                      <Label className="text-sm">Date Range</Label>
                      <Popover>
                          <PopoverTrigger asChild>
                              <Button
                                  variant={"outline"}
                                  className={cn(
                                      "w-full justify-start text-left font-normal bg-sidebar-background border-sidebar-border hover:bg-sidebar-accent",
                                      !dateRange && "text-muted-foreground"
                                  )}
                              >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {dateRange?.from ? (
                                      dateRange.to ? (
                                          <>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>
                                      ) : (
                                          format(dateRange.from, "LLL dd, y")
                                      )
                                  ) : (
                                      <span>Pick a date range</span>
                                  )}
                              </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                  initialFocus
                                  mode="range"
                                  defaultMonth={dateRange?.from}
                                  selected={dateRange}
                                  onSelect={setDateRange}
                                  numberOfMonths={2}
                              />
                          </PopoverContent>
                      </Popover>
                  </div>
                  
                  <div className="space-y-2">
                      <Label className="text-sm">Students ({selectedStudentIds.length}/{uniqueStudents.length})</Label>
                      <ScrollArea className="h-64 rounded-md border border-sidebar-border p-2">
                          {uniqueStudents.map(student => (
                              <div key={student.studentId} className="flex items-center space-x-2 py-1">
                                  <Checkbox 
                                      id={`student-${student.studentId}`} 
                                      checked={selectedStudentIds.includes(student.studentId)}
                                      onCheckedChange={(checked) => handleStudentFilterChange(student.studentId, !!checked)}
                                      className="border-sidebar-foreground data-[state=checked]:bg-sidebar-primary data-[state=checked]:text-sidebar-primary-foreground"
                                  />
                                  <label htmlFor={`student-${student.studentId}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                      {student.studentName}
                                  </label>
                              </div>
                          ))}
                      </ScrollArea>
                      {selectedStudentIds.length > 0 && 
                          <Button variant="link" className="p-0 h-auto text-xs text-sidebar-foreground/80" onClick={() => setSelectedStudentIds([])}>Clear selection</Button>
                      }
                  </div>
              </div>
          </aside>

          <main className="flex-1 p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
                  <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Students</CardTitle><Users className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.totalStudents}</div><p className="text-xs text-muted-foreground">{uniqueStudents.length > 0 ? `${((kpiStats.totalStudents / uniqueStudents.length) * 100).toFixed(0)}% of total students in filter` : '0% of total'}</p></CardContent></Card>
                  <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Certificates</CardTitle><FileTextIcon className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.totalCerts}</div><p className="text-xs text-muted-foreground">in current filter</p></CardContent></Card>
                  <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Avg. Certs / Student</CardTitle><Divide className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.avgCertsPerStudent}</div><p className="text-xs text-muted-foreground">in current filter</p></CardContent></Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-5 mb-6">
                <Card className="lg:col-span-3">
                    <CardHeader><CardTitle>Certificate Uploads Over Time</CardTitle></CardHeader>
                    <CardContent className="pl-2">
                        <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--chart-1))" } }} className="h-[300px] w-full">
                            <ResponsiveContainer>
                                <AreaChart data={monthlyUploads} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false}/>
                                    <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                    <Area type="monotone" dataKey="certificates" stroke="var(--color-certificates)" fill="var(--color-certificates)" fillOpacity={0.4} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Top Students by Certificate Count</CardTitle><CardDescription>Top 5 students in the filtered range.</CardDescription></CardHeader>
                    <CardContent>
                        <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--chart-2))" } }} className="h-[300px] w-full">
                           <ResponsiveContainer>
                                <BarChart data={topStudentsData} layout="vertical" margin={{ left: 10, right: 10, top:10, bottom:10 }}>
                                    <CartesianGrid horizontal={false} />
                                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={8} width={80} />
                                    <XAxis type="number" allowDecimals={false} />
                                    <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                    <Bar dataKey="certificates" fill="var(--color-certificates)" radius={4} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
              </div>
              
              {searchTerm && searchAnalysisData.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Search Analysis</CardTitle>
                    <CardDescription>Distribution of found certificates across students.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--chart-2))" } }} className="h-[250px] w-full">
                        <ResponsiveContainer>
                            <BarChart data={searchAnalysisData} layout="vertical" margin={{ left: 10, right: 10, top:10, bottom:10 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={8} width={80} />
                                <XAxis type="number" allowDecimals={false} />
                                <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="certificates" fill="var(--color-certificates)" radius={4} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
               )}

               <Card>
                  <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Details</CardTitle>
                      <CardDescription>
                        {searchTerm 
                          ? `Found ${filteredData.length} certificate(s) across ${new Set(filteredData.map(d => d.studentId)).size} of ${uniqueStudents.length} total student(s).`
                          : "Detailed view of certificates. Use search to find specific records."
                        }
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <div className="w-full md:w-auto md:min-w-[250px]">
                        <SearchWithSuggestions onSearch={setSearchTerm} placeholder="Search certificates..." searchableData={searchableItems} />
                      </div>
                      {searchTerm && filteredData.length > 0 && (
                        <Button onClick={handleDownloadZip} disabled={isDownloading} size="icon" title="Download Results as ZIP">
                          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      {searchTerm ? (
                        <div className="space-y-3">
                          {filteredData.length > 0 ? filteredData.map(cert => (
                            <div key={cert.fileId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md bg-background gap-4">
                              <div className="flex-grow">
                                <p className="font-semibold text-primary">{cert.originalName}</p>
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium">{cert.studentName}</span> ({cert.studentEmail})
                                </p>
                                {cert.studentRollNo && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Roll No: <span className="font-mono p-1 bg-muted rounded">{cert.studentRollNo}</span>
                                  </p>
                                )}
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openViewModal(cert)} 
                                className="w-full sm:w-auto shrink-0"
                              >
                                <FileTextIcon className="mr-2 h-4 w-4" />
                                View Certificate
                              </Button>
                            </div>
                          )) : <p className="text-muted-foreground text-center py-8">No certificates match your search.</p>}
                        </div>
                      ) : (
                        // Default View: Grouped by student
                        studentsWithCertsForTable.length > 0 ? studentsWithCertsForTable.map((student) => (
                          <Card key={student.studentId} className="bg-muted/30">
                            <CardHeader className="flex flex-row items-center justify-between py-3">
                              <div>
                                <CardTitle className="text-base">{student.studentName}</CardTitle>
                                <CardDescription>{student.studentEmail} {student.studentRollNo && ` - Roll: ${student.studentRollNo}`}</CardDescription>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => toggleStudentExpansion(student.studentId)}>
                                {expandedStudents.has(student.studentId) ? 'Collapse' : `View All (${student.certificates.length})`}
                                {expandedStudents.has(student.studentId) ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                              </Button>
                            </CardHeader>
                            {expandedStudents.has(student.studentId) && (
                              <CardContent className="pt-0 pb-3">
                                <div className="space-y-2 mt-2 border-t pt-3">
                                  {student.certificates.map(cert => (
                                    <div key={cert.fileId} className="flex items-center justify-between p-2 border rounded-md bg-background">
                                      <p className="truncate pr-4">{cert.originalName} <span className="text-xs text-muted-foreground ml-2">({new Date(cert.uploadDate).toLocaleDateString()})</span></p>
                                      <Button variant="outline" size="sm" onClick={() => openViewModal(cert)}>View</Button>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        )) : <p className="text-muted-foreground text-center py-8">No students or certificates match the current filters.</p>
                      )}
                  </CardContent>
              </Card>
          </main>
          {selectedImageForView && <ViewImageModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} image={selectedImageForView} />}
        </div>
    );
}


// ====================================================================================
// Main Page Router
// ====================================================================================
function HomePage() {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProtectedPage>
      {userProfile?.role === 'admin' ? <AdminHomePageContent /> : <StudentHomePageContent />}
    </ProtectedPage>
  );
}

export default HomePage;
