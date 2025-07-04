
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, AlertCircle, Search, Download, FileText, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback } from 'react';

// --- Student-specific imports ---
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { PieChart, LineChart as RechartsLineChart, Pie, Line, XAxis, YAxis, CartesianGrid, Cell, Sector, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Hash, View } from 'lucide-react';

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

const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
};

// Active Shape for Pie Chart
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="hsl(var(--foreground))" className="text-sm font-semibold">
        {truncateText(payload.name, 25)}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="hsl(var(--muted-foreground))" className="text-xs">
        {`${value} Certs (${(percent * 100).toFixed(0)}%)`}
      </text>
    </g>
  );
};

function AdminHomePageContent() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<DashboardData[]>([]);
    const [allStudents, setAllStudents] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [activePieIndex, setActivePieIndex] = useState(0);

    const [isDownloading, setIsDownloading] = useState(false);

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
    
    const onPieEnter = useCallback((_: any, index: number) => {
        setActivePieIndex(index);
    }, []);

    const chartData = useMemo(() => {
        const courseCounts: { [key: string]: number } = {};
        const completionTrends: { [key: string]: number } = {};

        dashboardData.forEach(cert => {
            const courseName = cert.originalName;
            courseCounts[courseName] = (courseCounts[courseName] || 0) + 1;
            
            const date = format(parseISO(cert.uploadDate), 'yyyy-MM-dd');
            completionTrends[date] = (completionTrends[date] || 0) + 1;
        });

        const pieData = Object.entries(courseCounts)
            .map(([name, value], index) => ({ name, value, fill: `hsl(var(--chart-${(index % 5) + 1}))` }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
            
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

    const gaugeChartData = useMemo(() => {
        if (!searchTerm.trim() || allStudents.length === 0) return [];
        const studentIdsWithCert = new Set(searchResults.map(item => item.studentId));
        const numStudentsWithCert = studentIdsWithCert.size;
        return [
            { name: 'Has Certificate', value: numStudentsWithCert, fill: 'hsl(var(--chart-1))' },
            { name: 'Does Not Have', value: allStudents.length - numStudentsWithCert, fill: 'hsl(var(--muted))' }
        ];
    }, [searchTerm, searchResults, allStudents]);
    
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
                                <CardTitle className="flex items-center"><PieChartIcon className="mr-2"/>Top 10 Course Certificate Distribution</CardTitle>
                            </CardHeader>
                            <CardContent className="flex justify-center items-center">
                                <ChartContainer config={pieChartConfig} className="mx-auto aspect-square h-[250px] sm:h-[400px]">
                                    <PieChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                                        <Pie 
                                            data={chartData.pieChartData} 
                                            cx="50%" 
                                            cy="50%" 
                                            labelLine={false}
                                            outerRadius="80%"
                                            dataKey="value"
                                            activeIndex={activePieIndex}
                                            activeShape={renderActiveShape}
                                            onMouseEnter={onPieEnter}
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
                                <CardTitle className="flex items-center"><LineChartIcon className="mr-2"/>Certificate Uploads Over Time</CardTitle>
                            </CardHeader>
                            <CardContent>
                               <ChartContainer config={lineChartConfig} className="h-[250px] w-full sm:h-[400px]">
                                    <RechartsLineChart accessibilityLayer data={chartData.lineChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={30} />
                                      <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                      <ChartLegend content={<ChartLegendContent />} />
                                      <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} name="Uploads"/>
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
