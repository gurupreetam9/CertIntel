
'use client';

import ProtectedPage from '@/components/auth/ProtectedPage';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users, Search as SearchIcon, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
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

// Type for grouped search results for admin
type GroupedStudentResult = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentRollNo?: string;
  matchingCertificates: UserImage[];
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
    const [sortConfig, setSortConfig] = useState<{ key: 'studentName' | 'studentRollNo'; direction: 'asc' | 'desc' } | null>(null);
    const [selectedImageForView, setSelectedImageForView] = useState<UserImage | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
    const { user } = useAuth();
    const { toast } = useToast();

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

    const { studentCount, certsPerStudentData } = useMemo(() => {
        if (!dashboardData) return { studentCount: 0, certsPerStudentData: [] };
        const studentMap = new Map<string, { name: string; count: number }>();
        dashboardData.forEach(cert => {
            if (studentMap.has(cert.studentId)) {
                studentMap.get(cert.studentId)!.count++;
            } else {
                studentMap.set(cert.studentId, { name: cert.studentName, count: 1 });
            }
        });
        return {
            studentCount: studentMap.size,
            certsPerStudentData: Array.from(studentMap.values()).map(s => ({ name: s.name, certificates: s.count })),
        };
    }, [dashboardData]);

    const groupedAndSortedResults = useMemo(() => {
        if (!searchTerm) {
            return []; // Don't show anything if search is empty
        }

        const filteredCerts = dashboardData.filter(cert => 
            cert.originalName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const studentGroups: { [key: string]: GroupedStudentResult } = {};

        filteredCerts.forEach(cert => {
            if (!studentGroups[cert.studentId]) {
                studentGroups[cert.studentId] = {
                    studentId: cert.studentId,
                    studentName: cert.studentName,
                    studentEmail: cert.studentEmail,
                    studentRollNo: cert.studentRollNo,
                    matchingCertificates: [],
                };
            }
            studentGroups[cert.studentId].matchingCertificates.push(cert);
        });

        let results = Object.values(studentGroups);

        if (sortConfig) {
            results.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return results;
    }, [dashboardData, searchTerm, sortConfig]);

    const requestSort = (key: 'studentName' | 'studentRollNo') => {
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
                        <CardTitle>Certificates Per Student</CardTitle>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <ChartContainer config={{
                            certificates: { label: "Certificates", color: "hsl(var(--primary))" },
                        }} className="h-[200px] w-full">
                            <ResponsiveContainer>
                                <BarChart data={certsPerStudentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                                    <YAxis allowDecimals={false} />
                                    <RechartsTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="certificates" fill="var(--color-certificates)" radius={4} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Certificate Search</CardTitle>
                    <CardDescription>Search for a certificate by name across all linked students.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative mb-4">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search by certificate name..." 
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => requestSort('studentName')}>
                                            Student Name <ArrowUpDown className="ml-2 h-4 w-4" />
                                        </Button>
                                    </TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => requestSort('studentRollNo')}>
                                            Roll No <ArrowUpDown className="ml-2 h-4 w-4" />
                                        </Button>
                                    </TableHead>
                                    <TableHead>Matching Certs</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedAndSortedResults.length > 0 ? (
                                    groupedAndSortedResults.map((student) => (
                                        <React.Fragment key={student.studentId}>
                                            <TableRow>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => toggleStudentExpansion(student.studentId)}
                                                        aria-label={expandedStudents.has(student.studentId) ? 'Collapse' : 'Expand'}
                                                    >
                                                        {expandedStudents.has(student.studentId) ? (
                                                            <ChevronUp className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </TableCell>
                                                <TableCell className="font-medium">{student.studentName}</TableCell>
                                                <TableCell>{student.studentEmail}</TableCell>
                                                <TableCell>{student.studentRollNo || 'N/A'}</TableCell>
                                                <TableCell>{student.matchingCertificates.length}</TableCell>
                                            </TableRow>
                                            {expandedStudents.has(student.studentId) && (
                                                student.matchingCertificates.map(cert => (
                                                    <TableRow key={cert.fileId} className="bg-muted/50 hover:bg-muted/75">
                                                        <TableCell></TableCell>
                                                        <TableCell colSpan={3} className="pl-6">{cert.originalName}</TableCell>
                                                        <TableCell>
                                                            <Button variant="outline" size="sm" onClick={() => openViewModal(cert)}>
                                                                View
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            {searchTerm ? 'No students found with matching certificates.' : 'Enter a certificate name to begin your search.'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

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
