
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, FileText as FileTextIcon, Search, Download, AlertCircle, BarChart2, PieChart, LineChart, Users, View, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
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
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { BarChart as RechartsBarChart, PieChart as RechartsPieChart, LineChart as RechartsLineChart, Bar, Pie, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer, Cell, Sector } from 'recharts';
import { format, parseISO } from 'date-fns';

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

type SortKey = 'studentName' | 'studentEmail' | 'originalName' | 'uploadDate';
type SortDirection = 'asc' | 'desc';

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
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill}>{payload.name}</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 6} outerRadius={outerRadius + 10} fill={fill} />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">{`${value} Certs`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">{`(Rate ${(percent * 100).toFixed(2)}%)`}</text>
    </g>
  );
};


function AdminHomePageContent() {
    const { user, userId } = useAuth();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<DashboardData[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('studentName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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
            } catch (err: any) {
                setError(err.message);
                toast({ title: "Error Loading Dashboard", description: err.message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user, toast]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const filteredAndSortedData = useMemo(() => {
        let filtered = dashboardData;
        if (searchTerm) {
            filtered = dashboardData.filter(item =>
                item.originalName.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        return [...filtered].sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [dashboardData, searchTerm, sortKey, sortDirection]);

    const chartData = useMemo(() => {
        const courseCounts: { [key: string]: number } = {};
        const studentCourseCounts: { [key: string]: Set<string> } = {};
        const completionTrends: { [key: string]: number } = {};

        dashboardData.forEach(cert => {
            const courseName = cert.originalName;
            
            // For Pie/Bar charts
            courseCounts[courseName] = (courseCounts[courseName] || 0) + 1;

            if (!studentCourseCounts[courseName]) {
                studentCourseCounts[courseName] = new Set();
            }
            studentCourseCounts[courseName].add(cert.studentId);
            
            // For Line chart
            const date = format(parseISO(cert.uploadDate), 'yyyy-MM-dd');
            completionTrends[date] = (completionTrends[date] || 0) + 1;
        });

        const pieChartData = Object.entries(courseCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10); // Top 10 courses

        const barChartData = Object.entries(studentCourseCounts)
            .map(([name, students]) => ({ name, students: students.size }))
            .sort((a, b) => b.students - a.students)
            .slice(0, 10);
            
        const lineChartData = Object.entries(completionTrends)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return { pieChartData, barChartData, lineChartData };
    }, [dashboardData]);

    const totalStudentsWithSearchedCert = useMemo(() => {
       if(!searchTerm) return 0;
       const studentIds = new Set(filteredAndSortedData.map(item => item.studentId));
       return studentIds.size;
    }, [filteredAndSortedData, searchTerm]);
    
    const totalStudents = useMemo(() => {
       const studentIds = new Set(dashboardData.map(item => item.studentId));
       return studentIds.size;
    }, [dashboardData]);

    const gaugeChartData = useMemo(() => {
        if (!searchTerm || totalStudents === 0) return [];
        return [
            { name: 'Has Certificate', value: totalStudentsWithSearchedCert },
            { name: 'Does Not Have', value: totalStudents - totalStudentsWithSearchedCert }
        ];
    }, [searchTerm, totalStudentsWithSearchedCert, totalStudents]);

    const handleDownloadZip = async () => {
        if (filteredAndSortedData.length === 0) {
            toast({ title: 'No certificates to download', variant: 'destructive' });
            return;
        }
        setIsDownloading(true);
        try {
            const idToken = await user?.getIdToken();
            const fileIds = filteredAndSortedData.map(cert => cert.fileId);

            const response = await fetch('/api/admin/download-zip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ fileIds })
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
                <AccordionTrigger className="text-xl font-semibold">Student & Course Analysis</AccordionTrigger>
                <AccordionContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center"><PieChart className="mr-2"/>Top 10 Course Certificate Distribution</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <RechartsPieChart>
                                        <RechartsTooltip content={<ChartTooltipContent hideLabel />} />
                                        <Pie 
                                            data={chartData.pieChartData} 
                                            cx="50%" 
                                            cy="50%" 
                                            labelLine={false}
                                            outerRadius={80} 
                                            fill="#8884d8" 
                                            dataKey="value"
                                            activeIndex={activePieIndex}
                                            activeShape={renderActiveShape}
                                            onMouseEnter={(_, index) => setActivePieIndex(index)}
                                        >
                                            {chartData.pieChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                                            ))}
                                        </Pie>
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center"><BarChart2 className="mr-2"/>Top 10 Courses by Student Count</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <RechartsBarChart data={barChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis type="number" hide />
                                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                                      <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent indicator="line" />} />
                                      <Bar dataKey="students" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                    </RechartsBarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                        <Card className="lg:col-span-2">
                             <CardHeader>
                                <CardTitle className="flex items-center"><LineChart className="mr-2"/>Certificate Uploads Over Time</CardTitle>
                            </CardHeader>
                            <CardContent>
                               <ResponsiveContainer width="100%" height={300}>
                                    <RechartsLineChart data={chartData.lineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                      <RechartsTooltip content={<ChartTooltipContent indicator="dot" />} />
                                      <RechartsLegend content={<ChartLegendContent />} />
                                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                    </RechartsLineChart>
                                </ResponsiveContainer>
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
                        placeholder="Search by course name (e.g., 'Introduction to Python')"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    {searchTerm && (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            <Card className="md:col-span-1">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Search Summary</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col items-center justify-center">
                                     <ResponsiveContainer width="100%" height={150}>
                                        <RechartsPieChart>
                                            <RechartsTooltip content={<ChartTooltipContent hideLabel />} />
                                            <Pie data={gaugeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} fill="hsl(var(--primary))" startAngle={180} endAngle={0}>
                                                 {gaugeChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={index === 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted))'} />
                                                 ))}
                                            </Pie>
                                        </RechartsPieChart>
                                     </ResponsiveContainer>
                                     <p className="text-center font-bold text-lg -mt-8">{totalStudentsWithSearchedCert} of {totalStudents} students</p>
                                     <p className="text-center text-sm text-muted-foreground">have this certificate.</p>
                                </CardContent>
                            </Card>
                            <div className="md:col-span-2 flex items-center justify-center">
                                <Button onClick={handleDownloadZip} disabled={isDownloading || filteredAndSortedData.length === 0} size="lg">
                                    {isDownloading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                                    Download {filteredAndSortedData.length} Certificates as ZIP
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {searchTerm && (
                <div>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead onClick={() => handleSort('studentName')} className="cursor-pointer"><div className="flex items-center">Name {sortKey === 'studentName' && (sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4"/> : <ArrowDown className="ml-2 h-4 w-4"/>)}</div></TableHead>
                            <TableHead onClick={() => handleSort('studentEmail')} className="cursor-pointer"><div className="flex items-center">Email {sortKey === 'studentEmail' && (sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4"/> : <ArrowDown className="ml-2 h-4 w-4"/>)}</div></TableHead>
                            <TableHead>Roll Number</TableHead>
                            <TableHead onClick={() => handleSort('originalName')} className="cursor-pointer"><div className="flex items-center">Certificate {sortKey === 'originalName' && (sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4"/> : <ArrowDown className="ml-2 h-4 w-4"/>)}</div></TableHead>
                            <TableHead onClick={() => handleSort('uploadDate')} className="cursor-pointer"><div className="flex items-center">Uploaded {sortKey === 'uploadDate' && (sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4"/> : <ArrowDown className="ml-2 h-4 w-4"/>)}</div></TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedData.map(cert => (
                                <TableRow key={cert.fileId}>
                                    <TableCell>{cert.studentName}</TableCell>
                                    <TableCell>{cert.studentEmail}</TableCell>
                                    <TableCell>{cert.studentRollNo || 'N/A'}</TableCell>
                                    <TableCell>{cert.originalName}</TableCell>
                                    <TableCell>{format(parseISO(cert.uploadDate), 'PPp')}</TableCell>
                                    <TableCell><Button variant="outline" size="sm" asChild><a href={`/api/images/${cert.fileId}`} target="_blank" rel="noopener noreferrer"><View className="mr-2 h-4 w-4"/>View</a></Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                  </div>
                  {/* Mobile Card List */}
                  <div className="block md:hidden space-y-4">
                        {filteredAndSortedData.map(cert => (
                            <Card key={cert.fileId} className="p-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="space-y-2 flex-grow">
                                      <p className="font-bold">{cert.originalName}</p>
                                      <p className="text-sm"><strong className="text-muted-foreground">Student:</strong> {cert.studentName}</p>
                                      <p className="text-sm"><strong className="text-muted-foreground">Email:</strong> {cert.studentEmail}</p>
                                      {cert.studentRollNo && <p className="text-sm"><strong className="text-muted-foreground">Roll No:</strong> {cert.studentRollNo}</p>}
                                      <p className="text-xs text-muted-foreground">Uploaded: {format(parseISO(cert.uploadDate), 'PPp')}</p>
                                    </div>
                                    <Button variant="outline" size="sm" asChild className="shrink-0"><a href={`/api/images/${cert.fileId}`} target="_blank" rel="noopener noreferrer"><View className="mr-2 h-4 w-4"/>View</a></Button>
                                </div>
                            </Card>
                        ))}
                  </div>
                  {filteredAndSortedData.length === 0 && <p className="text-center text-muted-foreground mt-8">No certificates found matching your search.</p>}
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
