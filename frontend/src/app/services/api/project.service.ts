import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProjectData {
  _id?: string;
  title: string;
  globalVertices: { x: number; z: number }[];
  roomVertexIndices: number[][];
  roomMetadata: { name: string; type: string; area: number }[];
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
}