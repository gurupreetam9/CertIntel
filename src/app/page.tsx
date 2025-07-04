
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Loader2, AlertCircle, Search, Download, FileText, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon, Mail, Hash, View } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// --- UI & Charting Imports ---
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart, Pie, Line, XAxis, YAxis, CartesianGrid, Cell, LineChart as RechartsLineChart } from 'recharts';
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

// ====================================================================================
// Student Home Page Content
// ====================================================================================
function StudentHomePageContent() {
  const router = useRouter(); // For future use if needed

  // Redirect to a more appropriate student dashboard if one exists, or just show this content.
  // For now, this is the main student view.
  
  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold font-headline mb-4">Welcome, Student!</h1>
      <p className="text-muted-foreground mb-6">This is your main dashboard. Your certificates should be managed through the floating action buttons.</p>
      
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="text-primary"/> Manage Your Certificates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use the <span className="inline-flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full mx-1">+</span> button at the bottom-right to upload new image or PDF certificates.
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="text-accent" /> Certificate Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground">
              Use the <span className="inline-flex items-center justify-center bg-accent text-accent-foreground w-6 h-6 rounded-full mx-1">AI</span> button to navigate to the AI feature page for certificate insights and recommendations.
            </p>
          </CardContent>
        </Card>
      </div>

    </div>
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
}

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};


function AdminHomePageContent() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<DashboardData[]>([]);
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [selectedChartData, setSelectedChartData] = useState<{ name: string; value: number } | null>(null);

    const [isDownloading, setIsDownloading] = useState(false);
    const [activePieIndex, setActivePieIndex] = useState(-1);

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
    
    const handlePieClick = useCallback((data: any) => {
        setSelectedChartData({ name: data.name, value: data.value });
        setIsChartModalOpen(true);
    }, []);

    const chartData = useMemo(() => {
        const courseCounts: { [key: string]: number } = {};
        const completionTrends: { [key: string]: number } = {};

        dashboardData.forEach(cert => {
            // Use originalName which is more descriptive than filename
            const courseName = cert.originalName || cert.fileId;
            courseCounts[courseName] = (courseCounts[courseName] || 0) + 1;
            
            const date = format(parseISO(cert.uploadDate), 'yyyy-MM-dd');
            completionTrends[date] = (completionTrends[date] || 0) + 1;
        });

        // For Pie chart, get top 10 courses
        const pieData = Object.entries(courseCounts)
            .map(([name, value], index) => ({ name, value, fill: `hsl(var(--chart-${(index % 5) + 1}))` }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
            
        // For Line chart, sort dates
        const lineData = Object.entries(completionTrends)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        return { pieChartData: pieData, lineChartData: lineData };
    }, [dashboardData]);

    const lineChartConfig = {
        count: {
            label: "Uploads",
            color: "hsl(var(--chart-1))",
        },
    } satisfies ChartConfig;
    
    const pieChartConfig = useMemo(() => {
        if (!chartData.pieChartData || chartData.pieChartData.length === 0) {
          return {};
        }
        const config: ChartConfig = {};
        chartData.pieChartData.forEach((item) => {
            config[item.name] = {
                label: item.name,
                color: item.fill,
            };
        });
        return config;
    }, [chartData.pieChartData]);
    
    const [allCertsFiltered, searchResults] = useMemo(() => {
        if (!searchTerm) {
            return [allStudents, []];
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        
        const certs = dashboardData.filter(item =>
            item.originalName.toLowerCase().includes(lowercasedFilter)
        );

        const studentsWithCert = Array.from(new Set(certs.map(item => item.studentId)))
            .map(id => {
                const studentProfile = allStudents.find(s => s.studentId === id);
                const relevantCerts = certs.filter(c => c.studentId === id);
                return {
                    ...studentProfile,
                    certificates: relevantCerts
                };
            });
        
        return [allStudents, studentsWithCert];
    }, [searchTerm, dashboardData, allStudents]);

    const gaugeChartConfig = {
        value: {
            label: "Students",
        },
        'Has Certificate': {
          label: 'Has Certificate',
          color: 'hsl(var(--chart-1))'
        },
        'Does Not Have': {
          label: 'Does Not Have',
          color: 'hsl(var(--muted))'
        },
    } satisfies ChartConfig;
    
    const gaugeChartData = useMemo(() => {
        if (!searchTerm.trim() || allStudents.length === 0) return [];
        const studentIdsWithCert = new Set(searchResults.map(item => item.studentId));
        const numStudentsWithCert = studentIdsWithCert.size;
        return [
            { name: 'Has Certificate', value: numStudentsWithCert, fill: 'var(--color-Has-Certificate)' },
            { name: 'Does Not Have', value: allStudents.length - numStudentsWithCert, fill: 'var(--color-Does-Not-Have)' }
        ];
    }, [searchTerm, searchResults, allStudents]);

    const handleDownloadZip = async () => {
        const fileIdsToDownload = searchResults.flatMap(student => student.certificates.map((cert: any) => cert.fileId));
        
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
                                <CardContent>
                                    <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[350px] sm:h-[400px]">
                                        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                                            <Pie
                                                data={chartData.pieChartData}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={"80%"}
                                                dataKey="value"
                                                onClick={(data) => handlePieClick(data.payload)}
                                                className="cursor-pointer"
                                            >
                                                {chartData.pieChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
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
                                   <ChartContainer config={lineChartConfig} className="h-[350px] w-full sm:h-[400px]">
                                        <RechartsLineChart accessibilityLayer data={chartData.lineChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                          <CartesianGrid strokeDasharray="3 3" />
                                          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                                          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                          <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} name="Uploads"/>
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
                                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                                     ))}
                                                </Pie>
                                            </PieChart>
                                         </ChartContainer>
                                         <p className="text-center font-bold text-lg -mt-8">{gaugeChartData[0]?.value || 0} of {allStudents.length} students</p>
                                         <p className="text-center text-sm text-muted-foreground">have this certificate.</p>
                                    </CardContent>
                                </Card>
                                <div className="md:col-span-2 flex items-center justify-center">
                                    <Button onClick={handleDownloadZip} disabled={isDownloading || searchResults.length === 0} size="lg">
                                        {isDownloading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                                        Download Certificates
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
                                        <TableHead>Student</TableHead>
                                        <TableHead>Certificate</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {searchResults.map((student: any) =>
                                        student.certificates.map((cert: any) => (
                                            <TableRow key={cert.fileId}>
                                                <TableCell>
                                                    <div className="font-medium">{student.studentName}</div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{student.studentEmail}</div>
                                                    {student.studentRollNo && <div className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" />{student.studentRollNo}</div>}
                                                </TableCell>
                                                <TableCell>{cert.originalName}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" asChild>
                                                        <a href={`/api/images/${cert.fileId}`} target="_blank" rel="noopener noreferrer">
                                                            <View className="mr-2 h-4 w-4" />View
                                                        </a>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
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
                    <h3 className="font-semibold text-lg break-words">{selectedChartData.name}</h3>
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
        </>
    );
}


// ====================================================================================
// Main Page Router
// ====================================================================================
function HomePage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!loading && user && userProfile?.role === 'student') {
        // This logic replaces the <StudentHomePageContent /> component
        // and redirects students to manage their certificates on the main grid view page
        // which now has the FABs for uploading and AI features.
        // We will show a simple placeholder while redirecting or if they land here briefly.
        // The main view for students will now be this home page itself, where they see their certificates.
        
        // This is a temporary setup. The ideal solution would be a separate /student/dashboard page.
        // For now, we'll assume the main page IS the student dashboard.
    }
  }, [user, userProfile, loading, router]);


  if (loading) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // The logic to redirect students has been removed.
  // Instead, the page now conditionally renders content based on role.
  // The FAB buttons are part of the student's view and not on this page anymore.
  // TODO: Refactor HomePage to move student grid and FABs to a separate component/page.
  // For now, we keep the student logic in `page.tsx` for simplicity.
  const studentViewNeedsImplementing = true;

  return (
    <ProtectedPage>
      {userProfile?.role === 'admin' ? (
        <AdminHomePageContent />
      ) : (
        // This is the student's view, now directly on the homepage.
        // This section should contain the student's certificate grid.
        // Redirecting to `/` from within itself doesn't make sense.
        // We'll show a simple placeholder for now as per the user's focus on the admin view.
        <div className="container mx-auto p-4 md:p-8">
            <h1 className="text-3xl font-bold font-headline mb-4">Your Certificate Hub</h1>
            <p className="text-muted-foreground mb-6">
                This is your dashboard. Soon you will see your certificate grid here. 
                For now, use the <span className="inline-flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full mx-1">+</span> button to upload 
                and the <span className="inline-flex items-center justify-center bg-accent text-accent-foreground w-6 h-6 rounded-full mx-1">AI</span> button for insights.
            </p>
            {/* The actual ImageGrid and FABs for students will be handled by a separate component or refactoring later */}
        </div>
      )}
    </ProtectedPage>
  );
}

export default HomePage;
