
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Loader2, AlertCircle, Search, Download, FileText, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon, ArrowUp, ArrowDown, View, Mail } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// --- UI & Charting Imports ---
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Line, XAxis, YAxis, CartesianGrid, LineChart as RechartsLineChart } from 'recharts';
import { format, parseISO } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ViewImageModal from '@/components/home/ViewImageModal';
import type { UserImage } from '@/components/home/ImageGrid';

// NEW - Imports for Student View
import ImageGrid from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';


// ====================================================================================
// Student Home Page Content
// ====================================================================================
function StudentHomePageContent() {
  const { user, userId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [images, setImages] = useState<UserImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prevKey => prevKey + 1);
  }, []);

  useEffect(() => {
    if (authLoading || !user || !userId) {
      if (!authLoading) setIsLoadingImages(false);
      return;
    }

    const fetchImages = async () => {
      setIsLoadingImages(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/user-images?userId=${userId}`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to fetch images' }));
          throw new Error(errorData.message);
        }
        const data: UserImage[] = await response.json();
        setImages(data);
      } catch (err: any) {
        setError(err.message);
        toast({ title: 'Error Loading Images', description: err.message, variant: 'destructive' });
      } finally {
        setIsLoadingImages(false);
      }
    };

    fetchImages();
  }, [user, userId, toast, refreshKey, authLoading]);

  return (
    <>
      <div className="container mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold font-headline mb-2">Your Certificate Hub</h1>
        <p className="text-muted-foreground mb-6">
          View your uploaded certificates below. Use the floating buttons to upload new files or get AI insights.
        </p>
        <ImageGrid
          images={images}
          isLoading={isLoadingImages}
          error={error}
          onImageDeleted={triggerRefresh}
          currentUserId={userId}
        />
      </div>
      <UploadFAB onUploadSuccess={triggerRefresh} />
      <AiFAB />
    </>
  );
}


// ====================================================================================
// Admin Home Page Content
// ====================================================================================

interface DashboardData {
    fileId: string;
    originalName: string;
    uploadDate: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    studentRollNo?: string;
    contentType: string;
    size: number;
}

type SortableKeys = 'studentName' | 'studentRollNo';

const LINE_CHART_STROKE_COLOR = 'hsl(45 90% 50%)';

function AdminHomePageContent() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<DashboardData[]>([]);
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [selectedChartData, setSelectedChartData] = useState<{ name: string; value: number } | null>(null);
    const [imageToViewInModal, setImageToViewInModal] = useState<UserImage | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);


    const [isDownloading, setIsDownloading] = useState(false);
    const [isNotifying, setIsNotifying] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>({
      key: 'studentName',
      direction: 'asc',
    });


    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            setError(null);
            try {
                const idToken = await user.getIdToken();
                const response = await fetch('/api/admin/dashboard-data', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch dashboard data.');
                }
                const data: DashboardData[] = await response.json();
                setDashboardData(data);

                const uniqueStudents = Array.from(new Set(data.map(item => item.studentId)))
                  .map(id => {
                    const student = data.find(item => item.studentId === id);
                    return {
                        studentId: id,
                        studentName: student?.studentName || 'Unknown',
                        studentEmail: student?.studentEmail || 'Unknown',
                        studentRollNo: student?.studentRollNo,
                        certificateCount: data.filter(item => item.studentId === id).length
                    };
                  });
                setAllStudents(uniqueStudents);

            } catch (err: any) {
                setError(err.message);
                toast({ title: "Error Loading Dashboard", description: err.message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user, toast]);
    
    const requestSort = (key: SortableKeys) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const handleOpenViewModal = (cert: DashboardData) => {
        setImageToViewInModal({
            ...cert,
            filename: cert.originalName, 
            uploadDate: cert.uploadDate,
            dataAiHint: '',
        });
        setIsViewModalOpen(true);
    };

    const handlePieClick = useCallback((data: any) => {
        setSelectedChartData({ name: data.name, value: data.value });
        setIsChartModalOpen(true);
    }, []);

    const searchResults = useMemo(() => {
        if (!searchTerm) {
            return [];
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        
        const certs = dashboardData.filter(item =>
            item.originalName.toLowerCase().includes(lowercasedFilter)
        );

        const sortedData = [...certs].sort((a, b) => {
            const key = sortConfig.key;
            const aVal = a[key as keyof typeof a] || '';
            const bVal = b[key as keyof typeof b] || '';
    
            if (key === 'studentRollNo') {
                return sortConfig.direction === 'asc' 
                    ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true }) 
                    : String(bVal).localeCompare(String(aVal), undefined, { numeric: true });
            }

            return sortConfig.direction === 'asc'
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });

        return sortedData;
    }, [searchTerm, dashboardData, sortConfig]);

    const gaugeChartData = useMemo(() => {
        if (!searchTerm.trim() || allStudents.length === 0) return [];
        const studentIdsWithCert = new Set(searchResults.map(cert => cert.studentId));
        const numStudentsWithCert = studentIdsWithCert.size;
        return [
            { name: 'has-certificate', value: numStudentsWithCert, fill: 'hsl(var(--chart-1))' },
            { name: 'does-not-have', value: allStudents.length - numStudentsWithCert, fill: 'hsl(var(--muted))' }
        ];
    }, [searchTerm, searchResults, allStudents]);

    const { pieChartData, pieChartConfig } = useMemo(() => {
        const courseCounts: { [key: string]: number } = {};
        dashboardData.forEach(cert => {
            const courseName = cert.originalName?.trim() || 'Unnamed Certificate';
            courseCounts[courseName] = (courseCounts[courseName] || 0) + 1;
        });
        
        const COLORS = [
          "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
          "hsl(var(--chart-4))", "hsl(var(--chart-5))",
        ];
        
        const rawPieData = Object.entries(courseCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const config: ChartConfig = {};
        const finalPieData = rawPieData.map((item, index) => {
            const key = `course-${index}`;
            config[key] = {
                label: item.name,
                color: COLORS[index % COLORS.length],
            };
            return { ...item, name: key, fill: COLORS[index % COLORS.length] };
        });
        
        return { pieChartData: finalPieData, pieChartConfig: config };
    }, [dashboardData]);

     const { lineChartData, lineChartConfig } = useMemo(() => {
        const completionTrends: { [key: string]: number } = {};
        dashboardData.forEach(cert => {
            const date = format(parseISO(cert.uploadDate), 'yyyy-MM-dd');
            completionTrends[date] = (completionTrends[date] || 0) + 1;
        });

        const lineData = Object.entries(completionTrends)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const config = {
            count: {
                label: "Uploads",
                color: "var(--color-count)",
            },
        } satisfies ChartConfig;

        return { lineChartData: lineData, lineChartConfig: config };
    }, [dashboardData]);


    const gaugeChartConfig = {
        'has-certificate': {
          label: 'Has Certificate',
          color: 'hsl(var(--chart-1))'
        },
        'does-not-have': {
          label: 'Does Not Have',
          color: 'hsl(var(--muted))'
        },
    } satisfies ChartConfig;

    const handleDownloadZip = async () => {
        const fileIdsToDownload = searchResults.map(cert => cert.fileId);
        
        if (fileIdsToDownload.length === 0) {
            toast({ title: 'No certificates to download for this search', variant: 'destructive' });
            return;
        }
        setIsDownloading(true);
        try {
            const idToken = await user?.getIdToken();
            const response = await fetch('/api/admin/download-zip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ fileIds: fileIdsToDownload })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to start download.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CertIntel_Export_${searchTerm || 'all'}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast({ title: 'Download Started', description: 'Your ZIP file is being prepared.' });

        } catch (err: any) {
            toast({ title: 'Download Failed', description: err.message, variant: 'destructive' });
        } finally {
            setIsDownloading(false);
        }
    };
    
    const studentsMissingCert = useMemo(() => {
        if (!searchTerm || !allStudents.length) return [];
        const studentIdsWithCert = new Set(searchResults.map(cert => cert.studentId));
        return allStudents.filter(student => !studentIdsWithCert.has(student.studentId));
    }, [searchTerm, searchResults, allStudents]);

    const handleNotifyMissingStudents = async () => {
        if (!user || !userProfile || studentsMissingCert.length === 0) return;

        setIsNotifying(true);
        try {
            const idToken = await user.getIdToken();
            const studentsToNotify = studentsMissingCert.map(s => ({
                email: s.studentEmail,
                name: s.studentName,
            }));

            const response = await fetch('/api/admin/notify-missing-students', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    students: studentsToNotify,
                    courseName: searchTerm,
                    adminName: userProfile.displayName || user.email,
                })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Failed to send notifications.');
            }
            toast({ title: 'Notifications Sent', description: result.message });
        } catch (err: any) {
            toast({ title: 'Notification Error', description: err.message, variant: 'destructive' });
        } finally {
            setIsNotifying(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Loading Admin Dashboard...</p>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="container mx-auto p-8 text-center">
                <AlertCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold">Failed to Load Dashboard</h2>
                <p className="text-muted-foreground mt-2">{error}</p>
            </div>
        );
    }
    
    return (
        <>
            <div className="container mx-auto p-4 md:p-8 space-y-8">
                <h1 className="text-3xl font-bold font-headline">Admin Analysis Dashboard</h1>

                <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-xl font-semibold">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="h-6 w-6"/> Student & Course Analysis
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <PieChartIcon className="h-5 w-5 shrink-0" />
                                        Top 10 Course Certificate Distribution
                                    </CardTitle>
                                    <CardDescription>Click a slice to see details.</CardDescription>
                                </CardHeader>
                                <CardContent className="flex justify-center">
                                    <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[300px] md:h-[450px]">
                                        <PieChart>
                                            <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                                            <Pie
                                                data={pieChartData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={"80%"}
                                                onClick={(data) => handlePieClick(data.payload.payload)}
                                                className="cursor-pointer"
                                            >
                                              {pieChartData.map((entry, index) => (
                                                  <Cell key={`cell-${index}`} fill={entry.fill} name={pieChartConfig[entry.name]?.label} />
                                              ))}
                                            </Pie>
                                        </PieChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <LineChartIcon className="h-5 w-5 shrink-0" />
                                        Certificate Uploads Over Time
                                    </CardTitle>
                                     <CardDescription>Daily count of new certificate uploads.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                   <ChartContainer config={lineChartConfig} className="h-[300px] md:h-[450px] w-full">
                                        <RechartsLineChart accessibilityLayer data={lineChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                          <CartesianGrid strokeDasharray="3 3" />
                                          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                                          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                          <Line type="monotone" dataKey="count" stroke={LINE_CHART_STROKE_COLOR} strokeWidth={2} dot={{ r: 4, fill: LINE_CHART_STROKE_COLOR }} activeDot={{ r: 8, stroke: "var(--color-background)" }} name="Uploads"/>
                                        </RechartsLineChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                        </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center"><Search className="mr-2" />Course & Certificate Search</CardTitle>
                        <CardDescription>Search for a specific course to see which students have uploaded a certificate for it. You can then download the results.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input
                            placeholder="Search by course name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        {searchTerm && (
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                <Card className="md:col-span-1">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">Search Summary</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center justify-center p-4">
                                         <ChartContainer config={gaugeChartConfig} className="mx-auto aspect-square h-[150px]">
                                            <PieChart>
                                                <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="name" />} />
                                                <Pie data={gaugeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} startAngle={180} endAngle={0}>
                                                    {gaugeChartData.map((entry, index) => (
                                                        <Cell key={`cell-gauge-${index}`} fill={entry.fill} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                         </ChartContainer>
                                         <p className="text-center font-bold text-lg -mt-8">{gaugeChartData.find(d => d.name === 'has-certificate')?.value || 0} of {allStudents.length} students</p>
                                         <p className="text-center text-sm text-muted-foreground">have this certificate.</p>
                                    </CardContent>
                                </Card>
                                <div className="md:col-span-2 flex items-center justify-center flex-wrap gap-4">
                                    <Button onClick={handleDownloadZip} disabled={isDownloading || searchResults.length === 0} size="lg">
                                        {isDownloading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                                        Download Certificates
                                    </Button>
                                    <Button onClick={handleNotifyMissingStudents} disabled={isNotifying || studentsMissingCert.length === 0} size="lg" variant="outline">
                                        {isNotifying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2 h-5 w-5" />}
                                        Notify {studentsMissingCert.length} Missing
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {searchTerm && (
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold font-headline">Search Results for "{searchTerm}"</h3>
                     {searchResults.length > 0 ? (
                        <div className="border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <Button variant="ghost" size="sm" onClick={() => requestSort('studentName')} className="p-0 h-auto hover:bg-transparent hover:text-primary/80">
                                                Student Name
                                                {sortConfig.key === 'studentName' && (sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                                            </Button>
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" size="sm" onClick={() => requestSort('studentRollNo')} className="p-0 h-auto hover:bg-transparent hover:text-primary/80">
                                                Roll No.
                                                {sortConfig.key === 'studentRollNo' && (sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                                            </Button>
                                        </TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Certificate</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {searchResults.map((cert: DashboardData) => (
                                         <TableRow key={cert.fileId}>
                                            <TableCell className="font-medium">{cert.studentName}</TableCell>
                                            <TableCell>{cert.studentRollNo || 'N/A'}</TableCell>
                                            <TableCell>{cert.studentEmail}</TableCell>
                                            <TableCell>{cert.originalName}</TableCell>
                                            <TableCell className="text-right">
                                                 <Button variant="outline" size="sm" onClick={() => handleOpenViewModal(cert)}>
                                                    <View className="mr-2 h-4 w-4" />View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                      <p className="text-center text-muted-foreground mt-8">No students found with a certificate matching your search.</p>
                    )}
                  </div>
                )}
            </div>

            {/* Dialog for chart data */}
            <Dialog open={isChartModalOpen} onOpenChange={setIsChartModalOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Course Certificate Details</DialogTitle>
                  <DialogDescription>
                    Full details for the selected course from the distribution chart.
                  </DialogDescription>
                </DialogHeader>
                {selectedChartData && (
                  <div className="py-4 space-y-2">
                    <h3 className="font-semibold text-lg break-words">{pieChartConfig[selectedChartData.name]?.label || selectedChartData.name}</h3>
                    <p className="text-muted-foreground">
                      Number of Students: <span className="font-bold text-lg text-foreground">{selectedChartData.value}</span>
                    </p>
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" onClick={() => setIsChartModalOpen(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {imageToViewInModal && (
              <ViewImageModal
                isOpen={isViewModalOpen}
                onClose={() => {
                    setIsViewModalOpen(false);
                    setImageToViewInModal(null);
                }}
                image={imageToViewInModal}
              />
            )}
        </>
    );
}


// ====================================================================================
// Main Page Router
// ====================================================================================
function HomePage() {
  const { user, userProfile, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProtectedPage>
      {userProfile?.role === 'admin' ? (
        <AdminHomePageContent />
      ) : (
        <StudentHomePageContent />
      )}
    </ProtectedPage>
  );
}

export default HomePage;
