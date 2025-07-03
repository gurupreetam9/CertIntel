
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, FileText as FileTextIcon, Divide, Calendar as CalendarIcon, Download, Search, FilterX, ChevronsUpDown } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


// Combined type for admin dashboard data
type AdminDashboardData = (UserImage & {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNo?: string;
});


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

  return (
    <div className="container mx-auto flex h-full flex-col px-2 py-4 sm:px-4 md:py-8">
      <div className="flex shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="text-center md:text-left">
            <h1 className="text-2xl font-bold font-headline sm:text-3xl md:text-4xl">Your Certificate Hub</h1>
            <p className="text-base text-muted-foreground sm:text-lg">Browse, upload, and manage your certificates.</p>
        </div>
      </div>
      <div className="my-4 shrink-0">
         <Input
            type="search"
            placeholder="Search certificates by name or filename..."
            className="w-full text-base"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
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
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'student' | 'certificate'>('newest');
    const [isDownloading, setIsDownloading] = useState(false);

    // UI state
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

        if (dateRange?.from) data = data.filter(d => isAfter(new Date(d.uploadDate), startOfMonth(dateRange.from!)));
        if (dateRange?.to) data = data.filter(d => isBefore(new Date(d.uploadDate), endOfMonth(dateRange.to!)));
        
        if (selectedStudentIds.length > 0) data = data.filter(d => selectedStudentIds.includes(d.studentId));
        
        if (searchTerm) data = data.filter(d => d.originalName.toLowerCase().includes(searchTerm.toLowerCase()));

        return data;
    }, [allData, dateRange, selectedStudentIds, searchTerm]);
    
    const sortedAndFilteredData = useMemo(() => {
      const data = [...filteredData];
      switch (sortOrder) {
          case 'oldest': return data.sort((a, b) => new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime());
          case 'student': return data.sort((a, b) => a.studentName.localeCompare(b.studentName) || new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          case 'certificate': return data.sort((a, b) => a.originalName.localeCompare(b.originalName) || new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          case 'newest': default: return data.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
      }
    }, [filteredData, sortOrder]);

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
        const dataForKpi = filteredData;
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
            .slice(0, 5)
            .reverse();
    }, [filteredData]);
    
    const handleDownloadZip = async () => {
      if (!user || sortedAndFilteredData.length === 0) return;
      setIsDownloading(true);
      toast({ title: "Preparing Download", description: `Zipping ${sortedAndFilteredData.length} certificate(s)...`});
      try {
        const idToken = await user.getIdToken();
        const fileIds = sortedAndFilteredData.map(cert => cert.fileId);
        const response = await fetch('/api/admin/download-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
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

    const handleClearFilters = () => {
      setDateRange(undefined);
      setSelectedStudentIds([]);
      setSearchTerm('');
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
        <main className="flex-1 p-6 overflow-y-auto bg-background">
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
          
           <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div>
                    <CardTitle>All Certificates</CardTitle>
                    <CardDescription>
                      Showing {sortedAndFilteredData.length} of {allData.length} total certificates. Use filters or search to refine.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-grow">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search certificates..."
                          className="w-full rounded-lg bg-background pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className="w-full sm:w-auto justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")
                                ) : ( <span>Date Range</span> )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                        </PopoverContent>
                      </Popover>

                      <Popover>
                          <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full sm:w-auto">
                                <Users className="mr-2 h-4 w-4" /> Students ({selectedStudentIds.length})
                              </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2">
                              <ScrollArea className="h-64">
                                  {uniqueStudents.map(student => (
                                      <div key={student.studentId} className="flex items-center space-x-2 p-2">
                                          <Checkbox 
                                              id={`student-${student.studentId}`} 
                                              checked={selectedStudentIds.includes(student.studentId)}
                                              onCheckedChange={(checked) => handleStudentFilterChange(student.studentId, !!checked)}
                                          />
                                          <Label htmlFor={`student-${student.studentId}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 truncate">
                                              {student.studentName}
                                          </Label>
                                      </div>
                                  ))}
                              </ScrollArea>
                          </PopoverContent>
                      </Popover>

                      <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as any)}>
                          <SelectTrigger className="w-full sm:w-auto">
                              <ChevronsUpDown className="mr-2 h-4 w-4" />
                              <SelectValue placeholder="Sort by..." />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="newest">Newest first</SelectItem>
                              <SelectItem value="oldest">Oldest first</SelectItem>
                              <SelectItem value="student">Student Name</SelectItem>
                              <SelectItem value="certificate">Certificate Name</SelectItem>
                          </SelectContent>
                      </Select>
                      <Button variant="ghost" onClick={handleClearFilters} disabled={!dateRange && selectedStudentIds.length === 0 && !searchTerm} title="Clear all filters">
                        <FilterX className="mr-2 h-4 w-4" />
                        Clear
                      </Button>
                       <Button onClick={handleDownloadZip} disabled={isDownloading || sortedAndFilteredData.length === 0} size="icon" title="Download Visible Results as ZIP">
                          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  {searchTerm && searchAnalysisData.length > 0 && (
                      <div className="border rounded-lg p-4">
                              <h3 className="text-lg font-semibold font-headline mb-1">Search Analysis</h3>
                              <p className="text-sm text-muted-foreground mb-4">
                                  Distribution of certificates matching your search.
                              </p>
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
                          </div>
                  )}

                  <div className="space-y-3">
                    {sortedAndFilteredData.length > 0 ? sortedAndFilteredData.map(cert => (
                      <div key={cert.fileId} className="flex items-center justify-between p-3 border rounded-md bg-background/50 hover:bg-muted/50 transition-colors gap-4">
                        <div className="flex-grow min-w-0">
                            <p className="font-semibold text-primary truncate" title={cert.originalName}>
                                {cert.originalName}
                            </p>
                            <div className="text-sm text-muted-foreground mt-1 flex items-baseline gap-x-4 flex-wrap">
                                <span className="truncate" title={`${cert.studentName} (${cert.studentEmail})`}>
                                    {cert.studentName} ({cert.studentEmail})
                                </span>
                                {cert.studentRollNo && (
                                    <span className="flex items-baseline gap-x-2 shrink-0">
                                        <span>Roll No:</span>
                                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-sm">
                                            {cert.studentRollNo}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => openViewModal(cert)} 
                            className="shrink-0"
                        >
                            <FileTextIcon className="mr-2 h-4 w-4" />
                            View Certificate
                        </Button>
                      </div>
                    )) : (
                      <p className="text-muted-foreground text-center py-8">No certificates match your criteria.</p>
                    )}
                  </div>
              </CardContent>
          </Card>
          {selectedImageForView && <ViewImageModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} image={selectedImageForView} />}
        </main>
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
