
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, Search as SearchIcon, ArrowUpDown, ChevronDown, ChevronUp, Download } from 'lucide-react';
import React, { useEffect, useState, useCallback, useMemo } from 'react';

// --- Student-specific imports ---
import ImageGrid from '@/components/home/ImageGrid';
import type { UserImage } from '@/components/home/ImageGrid';
import UploadFAB from '@/components/home/UploadFAB';
import AiFAB from '@/components/home/AiFAB';
import SearchWithSuggestions from '@/components/common/SearchWithSuggestions';
import type { SearchableItem } from '@/components/common/SearchWithSuggestions';
import { useToast } from '@/hooks/use-toast';

// --- Admin-specific imports ---
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ViewImageModal from '@/components/home/ViewImageModal';

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
    const [dashboardData, setDashboardData] = useState<AdminDashboardData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: 'studentName' | 'studentRollNo' | 'originalName' | 'uploadDate'; direction: 'asc' | 'desc' } | null>(null);
    const [selectedImageForView, setSelectedImageForView] = useState<UserImage | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
    const { user } = useAuth();
    const { toast } = useToast();
    const [isDownloading, setIsDownloading] = useState(false);

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
                // Ensure data is sorted by date descending initially
                data.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
                setDashboardData(data);
            } catch (err: any) {
                setError(err.message);
                toast({ title: "Error Loading Dashboard", description: err.message, variant: 'destructive' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [user, toast]);
    
    const toggleStudentExpansion = (studentId: string) => {
        setExpandedStudents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(studentId)) {
                newSet.delete(studentId);
            } else {
                newSet.add(studentId);
            }
            return newSet;
        });
    };

    const { studentCount, topStudentsData } = useMemo(() => {
        if (!dashboardData) return { studentCount: 0, topStudentsData: [] };
        const studentMap = new Map<string, { name: string; count: number }>();
        dashboardData.forEach(cert => {
            if (studentMap.has(cert.studentId)) {
                studentMap.get(cert.studentId)!.count++;
            } else {
                studentMap.set(cert.studentId, { name: cert.studentName, count: 1 });
            }
        });
        
        const allStudents = Array.from(studentMap.values()).map(s => ({ name: s.name, certificates: s.count }));
        
        // Sort by certificate count descending and take top 5
        const sortedStudents = allStudents.sort((a, b) => b.certificates - a.certificates);
        const top5 = sortedStudents.slice(0, 5);
        
        return {
            studentCount: studentMap.size,
            topStudentsData: top5.reverse(), // Reverse for horizontal chart to show top at the top
        };
    }, [dashboardData]);

    // Data for the default view (grouped by student)
    const studentsWithCerts = useMemo(() => {
        const studentGroups: { [key: string]: StudentWithCertificates } = {};
        dashboardData.forEach(cert => {
            if (!studentGroups[cert.studentId]) {
                studentGroups[cert.studentId] = {
                    studentId: cert.studentId,
                    studentName: cert.studentName,
                    studentEmail: cert.studentEmail,
                    studentRollNo: cert.studentRollNo,
                    certificates: [],
                };
            }
            studentGroups[cert.studentId].certificates.push(cert);
        });
        // The data is already sorted by date descending from fetch
        return Object.values(studentGroups);
    }, [dashboardData]);

    // Data for the search view (flat and sorted)
    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        let filtered = dashboardData.filter(cert => 
            cert.originalName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (sortConfig) {
            filtered.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';
                if (sortConfig.key === 'uploadDate') {
                   return sortConfig.direction === 'asc' 
                    ? new Date(aValue).getTime() - new Date(bValue).getTime()
                    : new Date(bValue).getTime() - new Date(aValue).getTime();
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [dashboardData, searchTerm, sortConfig]);

    const searchAnalysis = useMemo(() => {
        if (!searchTerm || searchResults.length === 0) {
          return null;
        }
        const studentCertCount = new Map<string, { name: string, count: number }>();
        searchResults.forEach(cert => {
            if (studentCertCount.has(cert.studentId)) {
                studentCertCount.get(cert.studentId)!.count++;
            } else {
                studentCertCount.set(cert.studentId, { name: cert.studentName, count: 1 });
            }
        });

        return {
            studentsWithCert: studentCertCount.size,
            totalStudents: studentCount,
            chartData: Array.from(studentCertCount.values()).map(s => ({ name: s.name, certificates: s.count })),
        };
    }, [searchTerm, searchResults, studentCount]);

    const requestSort = (key: 'studentName' | 'studentRollNo' | 'originalName' | 'uploadDate') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const openViewModal = (image: UserImage) => {
        setSelectedImageForView(image);
        setIsViewModalOpen(true);
    };

    const handleDownloadZip = async () => {
        if (searchResults.length === 0 || !user) return;
    
        setIsDownloading(true);
        toast({
            title: "Preparing Download",
            description: `Zipping ${searchResults.length} certificate(s). Please wait...`
        });
    
        try {
            const fileIds = searchResults.map(cert => cert.fileId);
            const idToken = await user.getIdToken();
    
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
                throw new Error(errorData.message || "Failed to start download.");
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const contentDisposition = response.headers.get('content-disposition');
            let fileName = 'certificates.zip';
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch && fileNameMatch.length === 2) {
                    fileName = fileNameMatch[1];
                }
            }
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            toast({
                title: "Download Started",
                description: "Your ZIP file should be in your downloads folder."
            });
    
        } catch (err: any) {
            toast({
                title: "Download Failed",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const renderDefaultView = () => (
      <div className="space-y-4">
        {studentsWithCerts.map((student) => (
          <Card key={student.studentId}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{student.studentName}</CardTitle>
                <CardDescription>{student.studentEmail} {student.studentRollNo && ` - Roll: ${student.studentRollNo}`}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => toggleStudentExpansion(student.studentId)}>
                {expandedStudents.has(student.studentId) ? 'Collapse' : `View All (${student.certificates.length})`}
                {expandedStudents.has(student.studentId) ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Most Recent Upload</h4>
              {student.certificates.length > 0 ? (
                <div className="flex items-center justify-between p-2 border rounded-md">
                   <p className="truncate pr-4">{student.certificates[0].originalName}</p>
                   <Button variant="outline" size="sm" onClick={() => openViewModal(student.certificates[0])}>View</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No certificates uploaded yet.</p>
              )}
              
              {expandedStudents.has(student.studentId) && student.certificates.length > 1 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">All Uploads</h4>
                  <div className="space-y-2">
                    {student.certificates.map(cert => (
                       <div key={cert.fileId} className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                          <p className="truncate pr-4">{cert.originalName} <span className="text-xs text-muted-foreground ml-2">({new Date(cert.uploadDate).toLocaleDateString()})</span></p>
                          <Button variant="outline" size="sm" onClick={() => openViewModal(cert)}>View</Button>
                       </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );

    const renderSearchView = () => (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Certificate Search Results</CardTitle>
                        <CardDescription>
                          {searchAnalysis
                            ? `Found ${searchResults.length} matching certificate(s) across ${searchAnalysis.studentsWithCert} of ${searchAnalysis.totalStudents} total student(s).`
                            : `Found ${searchResults.length} certificate(s) matching your search.`
                          }
                        </CardDescription>
                    </div>
                    {searchResults.length > 0 && (
                        <Button onClick={handleDownloadZip} disabled={isDownloading}>
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download as ZIP
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {searchAnalysis && searchAnalysis.chartData.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Search Results Analysis</CardTitle>
                            <CardDescription>
                                Distribution of found certificates among students.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pl-2">
                             <ChartContainer config={{ certificates: { label: "Certs", color: "hsl(var(--accent))" } }} className="h-[250px] w-full">
                                <ResponsiveContainer>
                                    <BarChart
                                        layout="vertical"
                                        data={searchAnalysis.chartData}
                                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                                    >
                                        <CartesianGrid horizontal={false} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={8} width={100} />
                                        <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                                        <Bar dataKey="certificates" layout="vertical" fill="var(--color-certificates)" radius={4} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('originalName')}>Certificate <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('studentName')}>Student Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('uploadDate')}>Upload Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searchResults.length > 0 ? (
                                searchResults.map((cert) => (
                                    <TableRow key={cert.fileId}>
                                        <TableCell className="font-medium">{cert.originalName}</TableCell>
                                        <TableCell>{cert.studentName}</TableCell>
                                        <TableCell>{new Date(cert.uploadDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Button variant="outline" size="sm" onClick={() => openViewModal(cert)}>View</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">No certificates found matching your search.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-var(--header-height,4rem))] items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4">Loading Admin Dashboard...</p>
            </div>
        );
    }
    
    if (error) {
        return <div className="container py-8 text-center text-destructive">{error}</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
            <h1 className="text-3xl font-bold font-headline mb-6">Admin Dashboard</h1>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Linked Students</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{studentCount}</div>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Top Students by Certificate Count</CardTitle>
                        <CardDescription>Showing the top 5 students with the most uploads.</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ChartContainer config={{
                            certificates: { label: "Certs", color: "hsl(var(--primary))" },
                        }} className="h-[200px] w-full">
                            <ResponsiveContainer>
                                <BarChart
                                    layout="vertical"
                                    data={topStudentsData}
                                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                                >
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tickMargin={8} width={100}/>
                                    <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                                    <Bar dataKey="certificates" layout="vertical" fill="var(--color-certificates)" radius={4} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
            
             <div className="mb-6">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search for a certificate by name to see results..." 
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {searchTerm ? renderSearchView() : renderDefaultView()}

            {selectedImageForView && (
                <ViewImageModal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} image={selectedImageForView} />
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
