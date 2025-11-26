import React, { useState, useEffect, useCallback, useRef } from 'react';

// Constants for grid configuration, algorithms 
const GRID_SIZE = 25;                    
const NODE_SIZE = 24;                     
const ANIMATION_SPEEDS = { min: 1, max: 100 };  
const ALGORITHMS = {                      
  ASTAR: 'astar',
  BEST_FIRST: 'bestfirst',
  GREEDY: 'greedy',
  HILL_CLIMBING: 'hillclimbing',
  IDASTAR: 'idastar',
  SMASTAR: 'smastar'
};

// Color constants for consistent visual theming
const COLORS = {
  start: '#15a54aff',      
  end: '#ef4444',         
  wall: '#1f2937',       
  path: '#fbbf24',     
  visited: '#93c5fd',    
  current: '#f59e0b',     
  background: '#0f172a',    
  panel: '#1e293b',  
  border: '#334155',  
  text: '#e2e8f0'         
};

export default function PathfindingVisualizer() {
  /************************************/
  /* STATE MANAGEMENT                 */
  /************************************/
  
  // Grid and algorithm state
  const [grid, setGrid] = useState([]);                
  const [algorithm, setAlgorithm] = useState(ALGORITHMS.ASTAR);  
  const [isRunning, setIsRunning] = useState(false);     
  
  // Visualization state
  const [visited, setVisited] = useState(new Set());        
  const [path, setPath] = useState([]);             
  const [stats, setStats] = useState(null);            
  const [speed, setSpeed] = useState(50);                 
  const [algorithmSteps, setAlgorithmSteps] = useState([]);  
  const [currentNode, setCurrentNode] = useState(null);   
  
  // Exploration tree state 
  const [nodeParents, setNodeParents] = useState(new Map());  
  const [explorationTree, setExplorationTree] = useState([]);  
  
  // UI and interaction state
  const [dimensions, setDimensions] = useState({          
    width: window.innerWidth, 
    height: window.innerHeight 
  });
  const [treeOffset, setTreeOffset] = useState({ x: 0, y: 0 });  
  const [isDragging, setIsDragging] = useState(false);   
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 }); 

  // Refs for DOM access
  const treeSvgRef = useRef(null);                    

  // Fixed start and end positions
  const start = { x: 1, y: 1 };                            
  const end = { x: GRID_SIZE - 2, y: GRID_SIZE - 2 };      

  /************************************/
  /* WINDOW RESIZE HANDLING           */
  /************************************/

  // Update dimensions when window is resized
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /************************************/
  /* TREE DRAGGING FUNCTIONALITY      */
  /************************************/

  // Start dragging the tree visualization
  const handleTreeMouseDown = (e) => {
    if (e.button !== 0) return;  
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    if (treeSvgRef.current) {
      treeSvgRef.current.style.cursor = 'grabbing';
    }
  };

  // Drag the tree visualization
  const handleTreeMouseMove = (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    
    setTreeOffset(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  // Stop dragging the tree visualization
  const handleTreeMouseUp = () => {
    setIsDragging(false);
    if (treeSvgRef.current) {
      treeSvgRef.current.style.cursor = 'grab';
    }
  };

  // Zoom the tree visualization with mouse wheel
  const handleTreeWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    
    // Calculate new offset to zoom towards mouse position
    const rect = treeSvgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setTreeOffset(prev => ({
      x: mouseX - (mouseX - prev.x) * zoomFactor,
      y: mouseY - (mouseY - prev.y) * zoomFactor
    }));
  };

  // Reset tree view to initial position
  const resetTreeView = () => {
    setTreeOffset({ x: 0, y: 0 });
  };

  /************************************/
  /* INITIALIZATION & GRID MANAGEMENT */
  /************************************/

  // Generate a random grid with walls
  const generateGrid = useCallback(() => {
    const newGrid = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      const row = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        // Ensure start and end positions are always open
        if ((x === start.x && y === start.y) || (x === end.x && y === end.y)) {
          row.push(0);  
        } else {
          // 25% chance of wall, otherwise open cell
          row.push(Math.random() < 0.25 ? 1 : 0);  
        }
      }
      newGrid.push(row);
    }
    return newGrid;
  }, [start.x, start.y, end.x, end.y]);

  // Reset the entire visualizer to initial state
  const resetVisualizer = useCallback(() => {
    const newGrid = generateGrid();
    setGrid(newGrid);
    setAlgorithmSteps([]);
    setCurrentNode(null);
    setNodeParents(new Map());
    setVisited(new Set());
    setPath([]);
    setStats(null);
    setExplorationTree([]);
    resetTreeView();
  }, [generateGrid]);

  // Initialize grid on component mount
  useEffect(() => {
    resetVisualizer();
  }, []);

  /************************************/
  /* UTILITY FUNCTIONS                */
  /************************************/

  // Async delay for animation
  const delay = useCallback((ms) => new Promise(resolve => setTimeout(resolve, ms)), []);
  
  // Manhattan distance heuristic
  const heuristic = useCallback((a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y), []);

  // Get valid neighboring cells (up, right, down, left)
  const getNeighbors = useCallback((node) => {
    const neighbors = [];
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    
    for (const [dx, dy] of directions) {
      const x = node.x + dx;
      const y = node.y + dy;
      // Check bounds and ensure cell is not a wall
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && grid[y][x] === 0) {
        neighbors.push({ x, y });
      }
    }
    return neighbors;
  }, [grid]);

  // Add a step to the algorithm log
  const addStep = useCallback((message, nodeInfo = null) => {
    setAlgorithmSteps(prev => [...prev.slice(-29), { message, nodeInfo, timestamp: Date.now() }]);
    if (nodeInfo) setCurrentNode(nodeInfo);
  }, []);

  // Add an edge to the exploration tree visualization
  const addExplorationEdge = useCallback((from, to, cost = null) => {
    setExplorationTree(prev => [...prev, { from: { ...from }, to: { ...to }, cost, timestamp: Date.now() }]);
  }, []);

  // Calculate depth of a node in the exploration tree
  const getNodeDepth = useCallback((nodeKey) => {
    let depth = 0;
    let currentKey = nodeKey;
    while (nodeParents.get(currentKey)) {
      depth++;
      currentKey = nodeParents.get(currentKey);
    }
    return depth;
  }, [nodeParents]);

  // Determine color for a grid cell based on its state
  const getCellColor = useCallback((x, y) => {
    if (x === start.x && y === start.y) return COLORS.start;
    if (x === end.x && y === end.y) return COLORS.end;
    if (grid[y] && grid[y][x] === 1) return COLORS.wall;
    if (path.some(p => p.x === x && p.y === y)) return COLORS.path;
    if (visited.has(`${x},${y}`)) return COLORS.visited;
    return '#ffffff'; // Default white for unvisited cells
  }, [grid, path, visited, start.x, start.y, end.x, end.y]);

  // Reconstruct path from start to end using parent pointers
  const reconstructPath = useCallback((cameFrom, endNode) => {
    const path = [];
    let current = endNode;
    while (cameFrom.has(`${current.x},${current.y}`)) {
      path.unshift(current);
      current = cameFrom.get(`${current.x},${current.y}`);
    }
    path.unshift(current);
    return path;
  }, []);

  /************************************/
  /* ALGORITHM IMPLEMENTATIONS       */
  /************************************/

  // Main algorithm runner - orchestrates all pathfinding algorithms
  const runAlgorithm = async () => {
    if (isRunning) return;
    
    // Reset state for new run
    setIsRunning(true);
    setAlgorithmSteps([]);
    setCurrentNode(null);
    setNodeParents(new Map());
    setVisited(new Set());
    setPath([]);
    setStats(null);
    setExplorationTree([]);
    resetTreeView();
    
    addStep(`Starting ${algorithm.toUpperCase()}`);
    addStep(`Start: (${start.x},${start.y}), Goal: (${end.x},${end.y})`);

    const startTime = Date.now();
    let result;

    try {
      // Execute selected algorithm
      switch (algorithm) {
        case ALGORITHMS.ASTAR: result = await runAStar(); break;
        case ALGORITHMS.BEST_FIRST: result = await runBestFirst(); break;
        case ALGORITHMS.GREEDY: result = await runGreedy(); break;
        case ALGORITHMS.HILL_CLIMBING: result = await runHillClimbing(); break;
        case ALGORITHMS.IDASTAR: result = await runIDAStar(); break;
        case ALGORITHMS.SMASTAR: result = await runSMAStar(); break;
        default: result = await runAStar();
      }

      // Update statistics
      setStats({
        nodesExplored: result.nodesExplored,
        pathLength: result.path.length,
        time: Date.now() - startTime,
        success: result.path.length > 0
      });

      if (result.path.length > 0) {
        addStep(`✓ Path found! Length: ${result.path.length}`);
      } else {
        addStep('✗ No path found');
      }

    } catch (error) {
      addStep('⚠️ Algorithm execution failed');
      console.error('Algorithm error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // A* Algorithm: Optimal pathfinding using cost + heuristic
  const runAStar = async () => {
    const openSet = [];                    // Nodes to be evaluated
    const gScore = new Map();              // Cost from start to node
    const cameFrom = new Map();            // Parent pointers for path reconstruction
    const visitedNodes = new Set();        // Already evaluated nodes
    const parents = new Map();             // For tree visualization

    const startKey = `${start.x},${start.y}`;
    gScore.set(startKey, 0);               // Start node has cost 0
    openSet.push({ node: start, f: heuristic(start, end) });
    parents.set(startKey, null);

    let nodesExplored = 0;

    while (openSet.length > 0) {
      // Get node with lowest f-score
      openSet.sort((a, b) => a.f - b.f);
      const { node: current } = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      // Check if we reached the goal
      if (current.x === end.x && current.y === end.y) {
        const finalPath = reconstructPath(cameFrom, current);
        setPath(finalPath);
        return { path: finalPath, nodesExplored };
      }

      // Mark as visited and update visualization
      visitedNodes.add(currentKey);
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`Exploring (${current.x},${current.y}) f=${gScore.get(currentKey) + heuristic(current, end)}`, current);

      await delay(101 - speed); // Animation delay

      // Evaluate neighbors
      for (const neighbor of getNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        const tentativeG = gScore.get(currentKey) + 1; // All moves cost 1

        // Found better path to neighbor
        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const fScore = tentativeG + heuristic(neighbor, end);
          
          // Update open set
          const existingIndex = openSet.findIndex(item => 
            item.node.x === neighbor.x && item.node.y === neighbor.y
          );
          if (existingIndex !== -1) openSet.splice(existingIndex, 1);
          
          openSet.push({ node: neighbor, f: fScore });
          parents.set(neighborKey, currentKey);
          setNodeParents(new Map(parents));
          addExplorationEdge(current, neighbor, fScore);
        }
      }
    }
    return { path: [], nodesExplored }; // No path found
  };

  // Best-First Search: Heuristic-based exploration
  const runBestFirst = async () => {
    const openSet = [];
    const visitedNodes = new Set();
    const cameFrom = new Map();
    const parents = new Map();

    openSet.push({ node: start, h: heuristic(start, end) });
    parents.set(`${start.x},${start.y}`, null);

    let nodesExplored = 0;

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.h - b.h);
      const { node: current } = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      if (visitedNodes.has(currentKey)) continue;
      visitedNodes.add(currentKey);
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`Exploring (${current.x},${current.y}) h=${heuristic(current, end)}`, current);

      await delay(101 - speed);

      if (current.x === end.x && current.y === end.y) {
        const finalPath = reconstructPath(cameFrom, current);
        setPath(finalPath);
        return { path: finalPath, nodesExplored };
      }

      for (const neighbor of getNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visitedNodes.has(neighborKey)) {
          const hScore = heuristic(neighbor, end);
          cameFrom.set(neighborKey, current);
          
          const existingIndex = openSet.findIndex(item => 
            item.node.x === neighbor.x && item.node.y === neighbor.y
          );
          if (existingIndex !== -1) openSet.splice(existingIndex, 1);
          
          openSet.push({ node: neighbor, h: hScore });
          parents.set(neighborKey, currentKey);
          setNodeParents(new Map(parents));
          addExplorationEdge(current, neighbor, hScore);
        }
      }
    }
    return { path: [], nodesExplored };
  };

  // Greedy Search: Always choose locally optimal move
  const runGreedy = async () => {
    const openSet = [];
    const visitedNodes = new Set();
    const cameFrom = new Map();
    const parents = new Map();

    openSet.push({ node: start, h: heuristic(start, end) });
    parents.set(`${start.x},${start.y}`, null);

    let nodesExplored = 0;

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.h - b.h);
      const { node: current } = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      if (visitedNodes.has(currentKey)) continue;
      visitedNodes.add(currentKey);
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`Exploring (${current.x},${current.y}) h=${heuristic(current, end)}`, current);

      await delay(101 - speed);

      if (current.x === end.x && current.y === end.y) {
        const finalPath = reconstructPath(cameFrom, current);
        setPath(finalPath);
        return { path: finalPath, nodesExplored };
      }

      for (const neighbor of getNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visitedNodes.has(neighborKey)) {
          const hScore = heuristic(neighbor, end);
          cameFrom.set(neighborKey, current);
          openSet.push({ node: neighbor, h: hScore });
          parents.set(neighborKey, currentKey);
          setNodeParents(new Map(parents));
          addExplorationEdge(current, neighbor, hScore);
        }
      }
    }
    return { path: [], nodesExplored };
  };

  // Hill Climbing: Local search that can get stuck in local optima
  const runHillClimbing = async () => {
    let current = start;
    const currentPath = [current];
    const visitedNodes = new Set([`${current.x},${current.y}`]);
    const parents = new Map();
    let nodesExplored = 0;

    parents.set(`${start.x},${start.y}`, null);

    while (current.x !== end.x || current.y !== end.y) {
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`At (${current.x},${current.y}) h=${heuristic(current, end)}`, current);

      await delay(101 - speed);

      const neighbors = getNeighbors(current);
      if (neighbors.length === 0) {
        addStep('No available neighbors - stuck');
        break;
      }

      // Find best neighbor (lowest heuristic)
      let bestNeighbor = neighbors[0];
      let bestScore = heuristic(bestNeighbor, end);

      for (const neighbor of neighbors) {
        const score = heuristic(neighbor, end);
        if (score < bestScore) {
          bestNeighbor = neighbor;
          bestScore = score;
        }
      }

      // Stop if no improvement (local optimum)
      if (bestScore >= heuristic(current, end)) {
        addStep('Local optimum reached - cannot improve further');
        break;
      }

      // Move to best neighbor
      addExplorationEdge(current, bestNeighbor, bestScore);
      parents.set(`${bestNeighbor.x},${bestNeighbor.y}`, `${current.x},${current.y}`);
      setNodeParents(new Map(parents));

      current = bestNeighbor;
      currentPath.push(current);
      visitedNodes.add(`${current.x},${current.y}`);

      // Check if we reached the goal after moving
      if (current.x === end.x && current.y === end.y) {
        addStep('Reached target!');
        break;
      }
    }

    // Only set path and return success if we actually reached the target
    const reachedTarget = current.x === end.x && current.y === end.y;
    
    if (reachedTarget) {
      setPath(currentPath);
      addStep(`✓ Success! Path length: ${currentPath.length}`);
    } else {
      setPath([]);
      addStep('✗ Failed - stuck in local optimum');
    }

    return { path: reachedTarget ? currentPath : [], nodesExplored };
  };

  // IDA*: Iterative Deepening A* - memory-efficient version
  const runIDAStar = async () => {
    let bound = heuristic(start, end);
    const currentPath = [start];
    const visitedNodes = new Set();
    const parents = new Map();
    let nodesExplored = 0;

    parents.set(`${start.x},${start.y}`, null);

    // Recursive search function with depth limit
    const search = async (node, cost, bound) => {
      const fScore = cost + heuristic(node, end);
      if (fScore > bound) return fScore;

      const nodeKey = `${node.x},${node.y}`;
      visitedNodes.add(nodeKey);
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`Exploring (${node.x},${node.y}) f=${fScore}`, node);

      await delay(101 - speed);

      if (node.x === end.x && node.y === end.y) {
        setPath([...currentPath]);
        return -1; // Found goal
      }

      let minCost = Infinity;
      for (const neighbor of getNeighbors(node)) {
        if (!currentPath.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
          const neighborKey = `${neighbor.x},${neighbor.y}`;
          parents.set(neighborKey, nodeKey);
          setNodeParents(new Map(parents));
          addExplorationEdge(node, neighbor, fScore);

          currentPath.push(neighbor);
          const result = await search(neighbor, cost + 1, bound);
          if (result === -1) return -1;
          if (result < minCost) minCost = result;
          currentPath.pop();
        }
      }
      return minCost;
    };

    // Iteratively increase depth bound
    while (true) {
      const result = await search(start, 0, bound);
      if (result === -1) return { path: currentPath, nodesExplored };
      if (result === Infinity) return { path: [], nodesExplored };
      bound = result;
      addStep(`Increasing bound to ${bound}`);
    }
  };

  // SMA*: Simplified Memory-Bounded A* - handles memory constraints
  const runSMAStar = async () => {
    const MEMORY_LIMIT = 100;
    const openSet = [];
    const gScore = new Map();
    const cameFrom = new Map();
    const visitedNodes = new Set();
    const parents = new Map();

    const startKey = `${start.x},${start.y}`;
    gScore.set(startKey, 0);
    openSet.push({ node: start, f: heuristic(start, end) });
    parents.set(startKey, null);

    let nodesExplored = 0;

    while (openSet.length > 0) {
      // Remove worst node if memory limit exceeded
      if (openSet.length > MEMORY_LIMIT) {
        openSet.sort((a, b) => b.f - a.f);
        const removed = openSet.pop();
        addStep(`Memory full - removed (${removed.node.x},${removed.node.y})`);
      }

      openSet.sort((a, b) => a.f - b.f);
      const { node: current } = openSet.shift();
      const currentKey = `${current.x},${current.y}`;

      if (current.x === end.x && current.y === end.y) {
        const finalPath = reconstructPath(cameFrom, current);
        setPath(finalPath);
        return { path: finalPath, nodesExplored };
      }

      if (visitedNodes.has(currentKey)) continue;
      visitedNodes.add(currentKey);
      nodesExplored++;
      setVisited(new Set(visitedNodes));
      addStep(`Exploring (${current.x},${current.y}) f=${gScore.get(currentKey) + heuristic(current, end)}`, current);

      await delay(101 - speed);

      for (const neighbor of getNeighbors(current)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        const tentativeG = gScore.get(currentKey) + 1;
        
        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          gScore.set(neighborKey, tentativeG);
          cameFrom.set(neighborKey, current);
          const fScore = tentativeG + heuristic(neighbor, end);
          
          openSet.push({ node: neighbor, f: fScore });
          parents.set(neighborKey, currentKey);
          setNodeParents(new Map(parents));
          addExplorationEdge(current, neighbor, fScore);
        }
      }
    }
    return { path: [], nodesExplored };
  };

  /************************************/
  /* EXPLORATION TREE VISUALIZATION   */
  /************************************/

  // Build tree structure from parent-child relationships
  const buildExplorationTree = useCallback(() => {
    const nodeMap = new Map();
    const rootKey = `${start.x},${start.y}`;

    // Create root node
    nodeMap.set(rootKey, {
      key: rootKey,
      x: start.x,
      y: start.y,
      children: [],
      depth: 0,
      isInPath: path.some(p => p.x === start.x && p.y === start.y),
      isCurrent: currentNode && currentNode.x === start.x && currentNode.y === start.y
    });

    // Build tree structure from parent map
    Array.from(nodeParents.entries()).forEach(([childKey, parentKey]) => {
      if (!nodeMap.has(childKey)) {
        const [x, y] = childKey.split(',').map(Number);
        nodeMap.set(childKey, {
          key: childKey,
          x,
          y,
          children: [],
          depth: getNodeDepth(childKey),
          isInPath: path.some(p => p.x === x && p.y === y),
          isCurrent: currentNode && currentNode.x === x && currentNode.y === y
        });
      }
      
      // Add child to parent
      if (parentKey && nodeMap.has(parentKey)) {
        nodeMap.get(parentKey).children.push(nodeMap.get(childKey));
      }
    });

    return nodeMap.get(rootKey);
  }, [start.x, start.y, nodeParents, getNodeDepth, path, currentNode]);

  // Recursively render tree nodes and connections
  const renderTreeNode = useCallback((node, xPos, yPos, parentX = null, parentY = null) => {
    if (!node) return [];

    const elements = [];
    const verticalSpacing = 70;
    const horizontalSpacing = 60;

    const isInPath = node.isInPath;
    const isCurrent = node.isCurrent;
    const isGoal = node.x === end.x && node.y === end.y;
    const isStart = node.x === start.x && node.y === start.y;

    // Draw connection line from parent
    if (parentX !== null && parentY !== null) {
      elements.push(
        <line
          key={`line-${node.key}`}
          x1={parentX} y1={parentY} x2={xPos} y2={yPos}
          stroke={isInPath ? COLORS.path : '#8b5cf6'}
          strokeWidth={isInPath ? 2 : 1}
          opacity={isInPath ? 0.8 : 0.4}
        />
      );
    }

    // Draw node circle
    elements.push(
      <g key={`node-${node.key}`}>
        <circle
          cx={xPos} cy={yPos} r={16}
          fill={isStart ? COLORS.start : isGoal ? COLORS.end : isCurrent ? COLORS.current : isInPath ? COLORS.path : '#8b5cf6'}
          stroke="#fff" strokeWidth={isCurrent ? 2 : 1}
          opacity={isInPath || isStart || isGoal ? 1 : 0.7}
        />
        <text 
          x={xPos} y={yPos + 4} 
          textAnchor="middle" 
          fill="white" 
          fontSize="10" 
          fontWeight="bold"
        >
          {node.x},{node.y}
        </text>
      </g>
    );

    // Recursively render children
    const childCount = node.children.length;
    node.children.forEach((child, index) => {
      const childX = xPos + (index - (childCount - 1) / 2) * horizontalSpacing;
      const childY = yPos + verticalSpacing;
      const childElements = renderTreeNode(child, childX, childY, xPos, yPos);
      elements.push(...childElements);
    });

    return elements;
  }, [start.x, start.y, end.x, end.y]);

  const explorationTreeRoot = buildExplorationTree();

  /************************************/
  /* FULL-PAGE STYLES                 */
  /************************************/

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: 'Arial, sans-serif',
      overflow: 'hidden',
      margin: 0,
      padding: 0
    },
    header: {
      padding: '12px 20px',
      backgroundColor: COLORS.panel,
      borderBottom: `2px solid ${COLORS.border}`,
      fontSize: '20px',
      fontWeight: 'bold',
      flexShrink: 0
    },
    main: {
      display: 'flex',
      flex: 1,
      overflow: 'hidden',
      gap: '1px',
      backgroundColor: COLORS.border
    },
    panel: {
      backgroundColor: COLORS.background,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    },
    panelHeader: {
      padding: '10px 15px',
      backgroundColor: COLORS.panel,
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: '16px',
      fontWeight: 'bold',
      flexShrink: 0
    },
    panelContent: {
      flex: 1,
      padding: '15px',
      overflow: 'auto'
    },
    gridContainer: {
      backgroundColor: COLORS.background,
      padding: '10px',
      borderRadius: '8px',
      border: `1px solid ${COLORS.border}`,
      marginBottom: '15px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_SIZE}, ${NODE_SIZE}px)`,
      gap: '1px'
    },
    cell: {
      width: NODE_SIZE,
      height: NODE_SIZE,
      border: `1px solid ${COLORS.border}`,
      boxSizing: 'border-box'
    },
    button: {
      padding: '10px 15px',
      borderRadius: '6px',
      border: 'none',
      color: 'white',
      backgroundColor: '#3b82f6',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      flex: 1
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed'
    },
    step: {
      background: COLORS.background,
      padding: '8px',
      marginBottom: '4px',
      borderRadius: '4px',
      borderLeft: `3px solid #3b82f6`,
      fontSize: '12px'
    },
    stats: {
      padding: '12px',
      background: COLORS.panel,
      borderRadius: '6px',
      fontSize: '13px',
      marginTop: '10px'
    },
    select: {
      width: '100%',
      padding: '8px',
      borderRadius: '4px',
      background: COLORS.panel,
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
      marginBottom: '10px',
      fontSize: '14px'
    },
    algorithmInfo: {
      padding: '10px',
      background: '#1e3a8a',
      borderRadius: '4px',
      fontSize: '12px',
      marginBottom: '10px'
    },
    controlsRow: {
      display: 'flex',
      gap: '8px',
      marginBottom: '10px'
    },
    speedControl: {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      marginBottom: '10px'
    },
    treeControls: {
      display: 'flex',
      gap: '8px',
      marginBottom: '10px'
    },
    treeControlButton: {
      padding: '6px 12px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#475569',
      color: 'white',
      cursor: 'pointer',
      fontSize: '12px'
    }
  };

  // Calculate panel sizes - Larger left panel
  const panelSizes = {
    left: { width: Math.min(680, dimensions.width * 0.5) },  
    center: { flex: 1 },
    right: { width: Math.min(500, dimensions.width * 0.5) }  
  };

  const algorithmDescriptions = {
    [ALGORITHMS.ASTAR]: "A*: Optimal path using cost + heuristic",
    [ALGORITHMS.BEST_FIRST]: "Best-First: Heuristic-based exploration",
    [ALGORITHMS.GREEDY]: "Greedy: Local optimal choices",
    [ALGORITHMS.HILL_CLIMBING]: "Hill Climbing: Local search, can get stuck",
    [ALGORITHMS.IDASTAR]: "IDA*: Memory-efficient A*",
    [ALGORITHMS.SMASTAR]: "SMA*: Memory-bounded A*"
  };

  /************************************/
  /* RENDER COMPONENT                 */
  /************************************/

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        🧭 Pathfinding Algorithm Visualizer
      </div>
      
      <div style={styles.main}> 
        <div style={{ ...styles.panel, width: panelSizes.left.width }}>
          <div style={styles.panelHeader}>🗺️ Grid & Controls</div>
          <div style={styles.panelContent}>
            <div style={styles.gridContainer}>
              <div style={styles.grid}>
                {grid.map((row, y) =>
                  row.map((cell, x) => (
                    <div
                      key={`${x},${y}`}
                      style={{
                        ...styles.cell,
                        backgroundColor: getCellColor(x, y)
                      }}
                      title={`(${x}, ${y})`}
                    />
                  ))
                )}
              </div>
            </div>

            <select
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
              style={styles.select}
              disabled={isRunning}
            >
              <option value={ALGORITHMS.ASTAR}>A* Search</option>
              <option value={ALGORITHMS.BEST_FIRST}>Best-First Search</option>
              <option value={ALGORITHMS.GREEDY}>Greedy Search</option>
              <option value={ALGORITHMS.IDASTAR}>IDA* Search</option>
              <option value={ALGORITHMS.SMASTAR}>SMA* Search</option>
              <option value={ALGORITHMS.HILL_CLIMBING}>Hill Climbing</option>
            </select>

            <div style={styles.algorithmInfo}>
              <strong>Algorithm:</strong> {algorithmDescriptions[algorithm]}
            </div>

            <div style={styles.speedControl}>
              <label>Animation Speed: {speed}%</label>
              <input
                type="range"
                min={ANIMATION_SPEEDS.min}
                max={ANIMATION_SPEEDS.max}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                style={{ width: '100%' }}
                disabled={isRunning}
              />
            </div>

            <div style={styles.controlsRow}>
              <button
                style={{
                  ...styles.button,
                  ...(isRunning ? styles.buttonDisabled : {})
                }}
                disabled={isRunning}
                onClick={runAlgorithm}
              >
                ▶️ Run Algorithm
              </button>
              <button
                style={{
                  ...styles.button,
                  backgroundColor: '#475569'
                }}
                disabled={isRunning}
                onClick={resetVisualizer}
              >
                🔄 Reset
              </button>
            </div>

            {stats && (
              <div style={styles.stats}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📊 Statistics</div>
                <div>• Nodes Explored: {stats.nodesExplored}</div>
                <div>• Path Length: {stats.pathLength || '—'}</div>
                <div>• Time: {stats.time}ms</div>
                <div>• Status: {stats.success ? '✅ Success' : '❌ Failed'}</div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL - EXPLORATION TREE WITH SCROLL/DRAG */}
        <div style={{ ...styles.panel, ...panelSizes.center }}>
          <div style={styles.panelHeader}>
            🌳 Exploration Tree - {algorithm.toUpperCase()}
            {stats && ` (${stats.nodesExplored} nodes explored)`}
            <div style={{ float: 'right', fontSize: '12px', fontWeight: 'normal' }}>
              Drag to move
              <button 
                onClick={resetTreeView}
                style={styles.treeControlButton}
              >
                Reset View
              </button>
            </div>
          </div>
          <div style={styles.panelContent}>
            <svg 
              ref={treeSvgRef}
              width="100%" 
              height="100%" 
              style={{ 
                background: COLORS.background,
                borderRadius: '6px',
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
              onMouseDown={handleTreeMouseDown}
              onMouseMove={handleTreeMouseMove}
              onMouseUp={handleTreeMouseUp}
              onMouseLeave={handleTreeMouseUp}
              onWheel={handleTreeWheel}
              preserveAspectRatio="xMidYMid meet"
            >
              <g transform={`translate(${treeOffset.x}, ${treeOffset.y})`}>
                {explorationTreeRoot && renderTreeNode(
                  explorationTreeRoot, 
                  dimensions.width * 0.3, 
                  100
                )}
              </g>
               
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke={COLORS.border} strokeWidth="1" opacity="0.3"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </div>
 
        <div style={{ ...styles.panel, width: panelSizes.right.width }}>
          <div style={styles.panelHeader}>
            📝 Algorithm Steps ({algorithmSteps.length})
          </div>
          <div style={styles.panelContent}>
            <div style={{ 
              height: '100%', 
              overflowY: 'auto',
              paddingRight: '5px'
            }}>
              {algorithmSteps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    ...styles.step,
                    background: index === algorithmSteps.length - 1 ? '#1e3a8a' : COLORS.background
                  }}
                >
                  {step.message}
                  {step.nodeInfo && (
                    <div style={{ fontSize: '22px', color: '#9ca3af', marginTop: '2px' }}>
                      Node: ({step.nodeInfo.x}, {step.nodeInfo.y})
                    </div>
                  )}
                </div>
              ))}
              {algorithmSteps.length === 0 && (
                <div style={styles.step}>
                  Select an algorithm and click "Run" to start the visualization...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}