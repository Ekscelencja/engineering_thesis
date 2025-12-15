  import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProjectData {
  _id?: string;
  title: string;
  client: string;
  globalVertices: { x: number; z: number }[];
  roomVertexIndices: number[][];
  roomMetadata: { name: string; type: string; area: number }[];
  wallAppearance?: Record<string, {
    front?: { color?: string; texture?: string },
    back?: { color?: string; texture?: string },
    side?: { color?: string; texture?: string },
    top?: { color?: string; texture?: string },
    bottom?: { color?: string; texture?: string },
    hole?: { color?: string; texture?: string }
  }>;
  editorStep?: 1 | 2 | 3; // 1=Rooms, 2=Walls/Features, 3=Furnishing
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private apiUrl = '/api/projects';

  constructor(private http: HttpClient) {}
    
  saveProject(project: ProjectData): Observable<ProjectData> {
    return this.http.post<ProjectData>(this.apiUrl, project);
  }

  updateProject(id: string, project: ProjectData): Observable<ProjectData> {
    return this.http.put<ProjectData>(`${this.apiUrl}/${id}`, project);
  }

  loadProject(id: string): Observable<ProjectData> {
    return this.http.get<ProjectData>(`${this.apiUrl}/${id}`);
  }

  getProjects(): Observable<ProjectData[]> {
    return this.http.get<ProjectData[]>(this.apiUrl);
  }
  
  archiveProject(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/archive`, {});
  }

  deleteProject(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}