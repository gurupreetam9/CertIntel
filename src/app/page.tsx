
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, FileText as FileTextIcon, Divide, Calendar as CalendarIcon, Download, Search, FilterX, ChevronsUpDown } from 'lucide-react';
import React, { useEffect, useState, useMemo } from 'react';

// --- Student-specific imports ---
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';

// --- Admin-specific imports ---
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';


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

  const triggerRefresh = React.useCallback(() => {
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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value.toLowerCase());
  };

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
            className="w-full"
            value={searchTerm}
            onChange={handleSearch}
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
const GaugeChart = ({ value, totalValue, label }: { value: number; totalValue: number; label: string }) => {
  const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
  const data = [{ name: 'value', value: percentage }];

  return (
    <div className="relative w-full h-32 sm:h-40">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="75%"
          outerRadius="100%"
          barSize={12}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background
            dataKey="value"
            cornerRadius={10}
            className="fill-muted"
            angleAxisId={0}
          />
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            className="fill-primary"
            angleAxisId={0}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center -translate-y-2">
        <span className="text-2xl sm:text-3xl font-bold text-foreground">{value}</span>
        <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
};


function AdminHomePageContent() {
    const [allData, setAllData] = useState<AdminDashboardData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();
    const isMobile = useIsMobile();

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
        
        if (searchTerm) {
          const lowercasedSearchTerm = searchTerm.toLowerCase();
          data = data.filter(d => 
            d.originalName.toLowerCase().includes(lowercasedSearchTerm) ||
            d.studentName.toLowerCase().includes(lowercasedSearchTerm) ||
            d.studentEmail.toLowerCase().includes(lowercasedSearchTerm) ||
            (d.studentRollNo || '').toLowerCase().includes(lowercasedSearchTerm)
          );
        }

        return data;
    }, [allData, dateRange, selectedStudentIds, searchTerm]);

    const groupedAndSortedData = useMemo(() => {
      const studentCertificateMap = new Map<string, AdminDashboardData[]>();
  
      filteredData.forEach(cert => {
          if (!studentCertificateMap.has(cert.studentId)) {
              studentCertificateMap.set(cert.studentId, []);
          }
          studentCertificateMap.get(cert.studentId)!.push(cert);
      });
  
      const studentArray = Array.from(studentCertificateMap.entries()).map(([studentId, certs]) => {
          const studentInfo = certs[0]; 
          return {
              studentId,
              studentName: studentInfo.studentName,
              studentEmail: studentInfo.studentEmail,
              certificates: certs,
          };
      });
  
      if (sortOrder === 'student') {
          studentArray.sort((a, b) => a.studentName.localeCompare(b.studentName));
      }
      
      studentArray.forEach(student => {
          let certs = [...student.certificates];
          switch (sortOrder) {
              case 'oldest':
                certs.sort((a, b) => new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime());
                break;
              case 'certificate':
                certs.sort((a, b) => a.originalName.localeCompare(b.originalName));
                break;
              case 'newest':
              case 'student':
              default:
                certs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
                break;
          }
          student.certificates = certs;
      });
  
      return studentArray;
  
    }, [filteredData, sortOrder]);


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
            .slice(0, 5);
    }, [filteredData]);
    
    const handleDownloadZip = async () => {
      const dataToZip = filteredData;
      if (!user || dataToZip.length === 0) return;
      setIsDownloading(true);
      toast({ title: "Preparing Download", description: `Zipping ${dataToZip.length} certificate(s)...`});
      try {
        const idToken = await user.getIdToken();
        const fileIds = dataToZip.map(cert => cert.fileId);
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

    const formatXAxisTick = (tick: string) => {
        if (typeof tick !== 'string') return tick;
        const maxLength = isMobile ? 8 : 12; // Shorter length on mobile
        return tick.length > maxLength ? `${tick.substring(0, maxLength)}...` : tick;
    };


    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-16 w-16 animate-spin text-primary" /><p className="ml-4 text-lg">Loading Admin Dashboard...</p></div>;
    }
    
    if (error) {
        return <div className="container py-8 text-center text-destructive">{error}</div>;
    }

    return (
        <main className="flex-1 p-2 sm:p-4 md:p-6 overflow-y-auto bg-background">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold font-headline">Admin Dashboard</h1>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
              <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Students</CardTitle><Users className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.totalStudents}</div><p className="text-xs text-muted-foreground">{uniqueStudents.length > 0 ? `${((kpiStats.totalStudents / uniqueStudents.length) * 100).toFixed(0)}% of total students in filter` : '0% of total'}</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Certificates</CardTitle><FileTextIcon className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.totalCerts}</div><p className="text-xs text-muted-foreground">in current filter</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Avg. Certs / Student</CardTitle><Divide className="h-5 w-5 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{kpiStats.avgCertsPerStudent}</div><p className="text-xs text-muted-foreground">in current filter</p></CardContent></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-5 mb-6">
            <Card className="lg:col-span-3">
                <CardHeader><CardTitle>Certificate Uploads Over Time</CardTitle></CardHeader>
                <CardContent className="p-0 pt-4 pr-2 sm:pr-4 h-[250px] sm:h-[300px]">
                    <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--primary))" } }}>
                        <ResponsiveContainer>
                            <BarChart data={monthlyUploads} margin={{ top: 10, right: 10, bottom: isMobile ? 50 : 40, left: 0 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} angle={isMobile ? -45 : 0} textAnchor={isMobile ? "end" : "middle"} height={isMobile ? 60 : 50} tickFormatter={formatXAxisTick} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false}/>
                                <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="certificates" fill="var(--color-certificates)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>
            <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Top Students by Certificate Count</CardTitle><CardDescription>Top 5 students in the filtered range.</CardDescription></CardHeader>
                <CardContent className="p-0 pt-4 pr-2 sm:pr-4 h-[250px] sm:h-[300px]">
                    <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--accent))" } }}>
                       <ResponsiveContainer>
                            <BarChart data={topStudentsData} margin={{ top: 10, right: 10, bottom: 20, left: -10 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={5} tickFormatter={formatXAxisTick} interval={0} />
                                <YAxis type="number" allowDecimals={false} />
                                <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="certificates" fill="var(--color-certificates)" radius={[4, 4, 0, 0]} />
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
                      {searchTerm ? 
                        `Found ${filteredData.length} certificate(s) matching your search.` :
                        `Showing ${groupedAndSortedData.length} students with ${filteredData.length} total certificates.`
                      }
                    </CardDescription>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-grow">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search certificates, students, emails, or roll no..."
                          className="w-full rounded-lg bg-background pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
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
                       <Button onClick={handleDownloadZip} disabled={isDownloading || filteredData.length === 0} size="icon" title="Download Visible Results as ZIP">
                          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {searchTerm ? (
                  <div className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                       <Card>
                          <CardHeader className='pb-2'>
                              <CardTitle className="text-base font-medium">Certificate Matches</CardTitle>
                          </CardHeader>
                          <CardContent className="flex flex-col items-center justify-center gap-2">
                              <GaugeChart
                                  value={filteredData.length}
                                  totalValue={allData.length}
                                  label={`out of ${allData.length} total`}
                              />
                              <CardDescription>
                                  Found {filteredData.length} certificates matching your search.
                              </CardDescription>
                          </CardContent>
                      </Card>
                      <Card>
                          <CardHeader className='pb-2'>
                              <CardTitle className="text-base font-medium">Student Matches</CardTitle>
                          </CardHeader>
                          <CardContent className="flex flex-col items-center justify-center gap-2">
                              <GaugeChart
                                  value={new Set(filteredData.map(d => d.studentId)).size}
                                  totalValue={uniqueStudents.length}
                                  label={`out of ${uniqueStudents.length} total`}
                              />
                              <CardDescription>
                                  {new Set(filteredData.map(d => d.studentId)).size} students have certificates matching your search.
                              </CardDescription>
                          </CardContent>
                      </Card>
                    </div>
                    {filteredData.length > 0 ? (
                        <div className="border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                                    <TableHead className="hidden md:table-cell">Roll No</TableHead>
                                    <TableHead>Certificate</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredData.map((cert) => (
                                    <TableRow key={cert.fileId}>
                                        <TableCell className="font-medium p-2 md:p-4">{cert.studentName}</TableCell>
                                        <TableCell className="hidden sm:table-cell p-2 md:p-4">{cert.studentEmail}</TableCell>
                                        <TableCell className="hidden md:table-cell p-2 md:p-4">{cert.studentRollNo || 'N/A'}</TableCell>
                                        <TableCell className="p-2 md:p-4">
                                        <div className="flex flex-col gap-2 items-start">
                                            <span className="font-medium">{cert.originalName}</span>
                                            <Button variant="outline" size="sm" onClick={() => openViewModal(cert)} className="h-8">
                                                View Certificate
                                            </Button>
                                        </div>
                                        </TableCell>
                                    </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">No certificates match your search.</p>
                    )}
                  </div>
                ) : (
                  groupedAndSortedData.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full space-y-2">
                      {groupedAndSortedData.map(({ studentId, studentName, studentEmail, certificates }) => (
                        <AccordionItem key={studentId} value={studentId} className="border rounded-lg shadow-sm bg-background/50 data-[state=open]:shadow-md">
                            <AccordionTrigger className="p-3 sm:p-4 hover:no-underline text-left">
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-lg font-semibold">{studentName}</p>
                                    <p className="truncate text-sm text-muted-foreground">{studentEmail}</p>
                                </div>
                                <Badge variant="secondary" className="ml-4 flex-shrink-0 whitespace-nowrap">
                                  {certificates.length} Certificate(s)
                                </Badge>
                            </AccordionTrigger>
                            <AccordionContent className="px-2 sm:px-4 pb-4">
                                <ul className="space-y-4 pt-4 border-t">
                                    {certificates.map((cert) => (
                                      <li key={cert.fileId} className="border rounded-lg p-3 sm:p-4 shadow-sm bg-card">
                                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                          <div className="flex-grow">
                                            <p className="text-base font-semibold text-primary">{cert.originalName}</p>
                                            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                              <p><span className="font-medium text-foreground/80">Uploaded:</span> {format(new Date(cert.uploadDate), "PPP")}</p>
                                            </div>
                                          </div>
                                          <div className="mt-2 flex-shrink-0 sm:mt-0 flex flex-wrap items-center gap-2">
                                            <Button size="sm" variant="outline" onClick={() => openViewModal(cert)}>
                                              <FileTextIcon className="mr-2 h-4 w-4" />
                                              View Certificate
                                            </Button>
                                          </div>
                                        </div>
                                      </li>
                                    ))}
                                </ul>
                            </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No students or certificates match your criteria.</p>
                  )
                )}
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
